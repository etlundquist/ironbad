import asyncio
from datetime import datetime
import json
import logging

from uuid import UUID

from agents.items import ResponseInputItemParam
from fastapi import APIRouter, Depends, HTTPException
from openai.types.responses import EasyInputMessageParam, ResponseInputItem, ResponseInputTextParam
from sse_starlette import EventSourceResponse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openai import AsyncOpenAI
from openai.types.responses import EasyInputMessage
from agents import RunConfig, Runner

from app.features.contract_annotations.schemas import AnnotatedContract
from app.enums import ChatMessageRole, ChatMessageStatus
from app.models import Contract as DBContract, AgentChatThread as DBAgentChatThread, AgentChatMessage as DBAgentChatMessage

from app.api.deps import get_db
from app.features.contract_agent.agent import AgentContext, agent
from app.features.contract_agent.schemas import AgentEvalInputDataset, AgentEvalOutputCase, AgentEvalRunResponse, AgentEvalTaskInput, AgentEvalTaskOutput, AgentEventStreamContext, AgentChatThread, AgentChatMessage
from app.features.contract_agent.events import handle_event_stream
from app.features.contract_agent.schemas import AgentRunRequest
from app.features.contract_agent.services import process_request_attachments


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/agent/runs", tags=["contract_agent"])
async def create_agent_run(request: AgentRunRequest, db: AsyncSession = Depends(get_db)) -> EventSourceResponse:
    """create and execute a new agent run"""
    
    # fetch the relevant contract from the database and deserialize to pydantic
    query = select(DBContract).where(DBContract.id == request.contract_id)
    result = await db.execute(query)
    dbcontract = result.scalar_one_or_none()
    if not dbcontract:
        raise HTTPException(status_code=404, detail=f"contract_id={request.contract_id} not found")
    contract = AnnotatedContract.model_validate(dbcontract)

    # get/create the relevant chat thread
    # NOTE: the conversation history is managed server-side using the OpenAI Conversations API
    # NOTE: this allows all input/output items (reasoning, tool calls, etc.) to be included in the conversation history
    if request.chat_thread_id:
        query = select(DBAgentChatThread).where(DBAgentChatThread.id == request.chat_thread_id)
        result = await db.execute(query)
        chat_thread = result.scalar_one_or_none()
        if not chat_thread:
            raise HTTPException(status_code=404, detail=f"chat_thread_id={request.chat_thread_id} not found")
    else:
        openai = AsyncOpenAI()
        openai_conversation = await openai.conversations.create()
        chat_thread = DBAgentChatThread(contract_id=contract.id, openai_conversation_id=openai_conversation.id)
        db.add(chat_thread)
        await db.flush()

    # serialize the request attachments to store in the database
    if request.attachments:
        attachments = [json.loads(attachment.model_dump_json()) for attachment in request.attachments]
    else:
        attachments = []

    # add the new user message to the database
    user_message = DBAgentChatMessage(
        contract_id=contract.id, 
        chat_thread_id=chat_thread.id, 
        status=ChatMessageStatus.COMPLETED,
        role=ChatMessageRole.USER, 
        content=request.content,
        attachments=attachments
    )
    db.add(user_message)
    await db.flush()

    # add the new placeholder assistant message to the database 
    # NOTE: we add a placeholder assistant message to the database to be updated later by the event stream handler
    assistant_message = DBAgentChatMessage(
        contract_id=contract.id, 
        chat_thread_id=chat_thread.id, 
        status=ChatMessageStatus.PENDING,
        role=ChatMessageRole.ASSISTANT, 
        content="",
        parent_chat_message_id=user_message.id
    )
    db.add(assistant_message)
    await db.flush()

    # create the agent's runtime context and the event stream handler's context 
    agent_context = AgentContext(db=db, contract=contract, request=request)
    stream_context = AgentEventStreamContext(db=db, contract=contract, chat_thread_id=chat_thread.id, user_message_id=user_message.id, assistant_message_id=assistant_message.id)

    # prepare the user input as either a single string or list of content blocks based on the presence/absence of attachments
    # NOTE: user message attachments are included as additional text content blocks following the main request content
    # NOTE: this approach persists message-specific attachments in the conversation history without modifying the agent's overall instructions
    if request.attachments:
        attachment_blocks = await process_request_attachments(db=db, contract=contract, request=request)
        user_input: list[ResponseInputItemParam] = [EasyInputMessageParam(role="user", content=[ResponseInputTextParam(type="input_text", text=request.content)] + attachment_blocks)]
    else:
        user_input: str = request.content

    # execute the agent run with the user's current input, conversation history, and dynamic agent context
    result = Runner.run_streamed(
        starting_agent=agent, 
        input=user_input, 
        context=agent_context,
        conversation_id=chat_thread.openai_conversation_id,
        max_turns=25
    )

    # commit the initial user/assistant messages to the database and return the event stream response
    await db.commit()
    return EventSourceResponse(handle_event_stream(event_stream=result.stream_events(), context=stream_context))


@router.post("/agent/evals", tags=["contract_agent"], response_model=AgentEvalRunResponse)
async def create_agent_eval_run(dataset: AgentEvalInputDataset, db: AsyncSession = Depends(get_db)) -> AgentEvalRunResponse:
    """evaluate the agent with respect to the input dataset of test cases and pre-configured eval graders"""

    try:

        # FIXME: convert this into a TaskIQ background task with a semaphore to limit the number of concurrent agent runs
        task_inputs = [AgentEvalTaskInput(contract_filename=case.contract_filename, user_message=case.user_message, user_message_attachments=case.user_message_attachments) for case in dataset.cases]
        agent_task_outputs = await asyncio.gather(*[run_agent_eval_task(db=db, task_input=task_input) for task_input in task_inputs])
        output_cases = [AgentEvalOutputCase(**case_input.model_dump(), **task_output.model_dump()) for case_input, task_output in zip(dataset.cases, agent_task_outputs)]

        openai = AsyncOpenAI()
        evals = await openai.evals.list()
        agent_eval = next((eval for eval in evals.data if eval.name == "Agent Evaluation"), None)
        if not agent_eval:
            raise HTTPException(status_code=404, detail="Agent Evaluation OpenAI Eval Object not found")

        data_source_content = [{"item": output_case.model_dump(exclude_unset=True)} for output_case in output_cases]
        eval_run = await openai.evals.runs.create(
            eval_id=agent_eval.id,
            name=dataset.name,
            data_source={
                "type": "jsonl",
                "source": {
                    "type": "file_content",
                    "content": data_source_content
                }
            }
        )

        eval_run_response = AgentEvalRunResponse(
            eval_id=agent_eval.id,
            run_id=eval_run.id,
            run_name=eval_run.name,
            created_at=datetime.fromtimestamp(eval_run.created_at),
            report_url=eval_run.report_url,
            status=eval_run.status
        )
        return eval_run_response
     
    except Exception as e:

        logger.error("Error running agent evaluation", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agent/threads", tags=["contract_agent"])
async def get_agent_threads(db: AsyncSession = Depends(get_db)) -> list[AgentChatThread]:
    """get all agent chat threads"""

    query = select(DBAgentChatThread).order_by(DBAgentChatThread.created_at.desc())
    result = await db.execute(query)
    chat_threads = result.scalars().all()
    return [AgentChatThread.model_validate(thread) for thread in chat_threads]


@router.get("/agent/threads/current", tags=["contract_agent"])
async def get_current_agent_thread(db: AsyncSession = Depends(get_db)) -> AgentChatThread:
    """get the most recent agent chat thread"""

    query = select(DBAgentChatThread).order_by(DBAgentChatThread.created_at.desc()).limit(1)
    result = await db.execute(query)
    current_thread = result.scalar_one_or_none()
    if not current_thread:
        raise HTTPException(status_code=404, detail="no currentagent chat thread found")
    else:
        return AgentChatThread.model_validate(current_thread)


@router.get("/agent/threads/{thread_id}", tags=["contract_agent"])
async def get_agent_thread(thread_id: UUID, db: AsyncSession = Depends(get_db)) -> AgentChatThread:
    """get a single agent chat thread by ID"""

    query = select(DBAgentChatThread).where(DBAgentChatThread.id == thread_id)
    result = await db.execute(query)
    chat_thread = result.scalar_one_or_none()
    if not chat_thread:
        raise HTTPException(status_code=404, detail=f"agent_chat_thread_id={thread_id} not found")
    return AgentChatThread.model_validate(chat_thread)


@router.get("/agent/threads/{thread_id}/messages", tags=["contract_agent"])
async def get_agent_thread_messages(thread_id: UUID, db: AsyncSession = Depends(get_db)) -> list[AgentChatMessage]:
    """get all messages for an agent chat thread"""

    # validate that the agent chat thread exists
    query = select(DBAgentChatThread).where(DBAgentChatThread.id == thread_id)
    thread_result = await db.execute(query)
    chat_thread = thread_result.scalar_one_or_none()
    if not chat_thread:
        raise HTTPException(status_code=404, detail=f"agent_chat_thread_id={thread_id} not found")

    # get all messages for the agent chat thread
    query = select(DBAgentChatMessage).where(DBAgentChatMessage.chat_thread_id == thread_id).order_by(DBAgentChatMessage.created_at)
    result = await db.execute(query)
    messages = result.scalars().all()
    return [AgentChatMessage.model_validate(message) for message in messages]


@router.get("/agent/threads/{thread_id}/messages/{message_id}", tags=["contract_agent"])
async def get_agent_chat_message(thread_id: UUID, message_id: UUID, db: AsyncSession = Depends(get_db)) -> AgentChatMessage:
    """get a given agent chat message by ID"""

    # validate that the chat message exists for the agent chat thread
    query = select(DBAgentChatMessage).where(DBAgentChatMessage.chat_thread_id == thread_id, DBAgentChatMessage.id == message_id)
    message_result = await db.execute(query)
    message = message_result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail=f"agent_chat_message_id={message_id} not found")
    return AgentChatMessage.model_validate(message)


async def run_agent_eval_task(db: AsyncSession, task_input: AgentEvalTaskInput) -> AgentEvalTaskOutput:
    """create and execute a new agent task synchronously returning a RunResult object with the input and all output items"""

    # fetch the relevant contract from the database and deserialize to pydantic
    query = select(DBContract).where(DBContract.filename == task_input.contract_filename)
    result = await db.execute(query)
    dbcontract = result.scalar_one_or_none()
    if not dbcontract:
        raise ValueError(f"contract_filename={task_input.contract_filename} not found")
    contract = AnnotatedContract.model_validate(dbcontract)

    # prepare the agent context and user input (either a single string or list of content blocks based on the presence/absence of attachments) for the run
    agent_run_request = AgentRunRequest(contract_id=contract.id, content=task_input.user_message, attachments=task_input.user_message_attachments)
    agent_context = AgentContext(db=db, contract=contract, request=agent_run_request)
    if task_input.user_message_attachments:
        attachment_blocks = await process_request_attachments(db=db, contract=contract, request=agent_run_request)
        user_input: list[ResponseInputItemParam] = [EasyInputMessageParam(role="user", content=[ResponseInputTextParam(type="input_text", text=task_input.user_message)] + attachment_blocks)]
    else:
        user_input: str = task_input.user_message

    # add additional metadata to the run config to identify evaluation runs server-side
    run_config = RunConfig(workflow_name="Agent Evaluation")

    try:
        # execute the agent run synchronously returning a RunResult object with all input/output items
        result = await Runner.run(
            starting_agent=agent, 
            input=user_input, 
            context=agent_context,
            run_config=run_config,
            max_turns=25
        )
        # convert the run input to a list of input items
        if isinstance(result.input, str):
            input_items: list[ResponseInputItem] = [EasyInputMessage(type="message", role="user", content=result.input)] 
        else:
            input_items: list[ResponseInputItem] = result.input
        # convert the run output to a list of output items
        output_items: ResponseInputItem = [item.to_input_item() for item in result.new_items]
        return AgentEvalTaskOutput(
            status="success", 
            assistant_message=result.final_output,
            input_items=input_items,
            output_items=output_items
        )
    except Exception:
        # log the error and return a failure response
        logger.error("agent run failed!", exc_info=True)
        return AgentEvalTaskOutput(
            status="failure", 
            assistant_message="The agent run failed.", 
            input_items=[], 
            output_items=[]
        )
