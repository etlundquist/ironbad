import logging

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette import EventSourceResponse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openai import AsyncOpenAI

from agents import Runner

from app.features.contract_annotations.schemas import AnnotatedContract
from app.enums import ChatMessageRole, ChatMessageStatus
from app.models import Contract as DBContract, AgentChatThread as DBAgentChatThread, AgentChatMessage as DBAgentChatMessage

from app.api.deps import get_db
from app.features.contract_agent.agent import AgentContext, agent
from app.features.contract_agent.schemas import AgentRunEventStreamContext, AgentChatThread, AgentChatMessage
from app.features.contract_agent.events import handle_event_stream
from app.features.contract_agent.schemas import AgentRunRequest


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/agent/runs", tags=["contract_agent"])
async def run_contract_agent(request: AgentRunRequest, db: AsyncSession = Depends(get_db)) -> EventSourceResponse:
    """create and execute a new agent run"""
    
    # fetch the relevant contract from the database and deserialize to pydantic to add to the agent's runtime context
    query = select(DBContract).where(DBContract.id == request.contract_id)
    result = await db.execute(query)
    dbcontract = result.scalar_one_or_none()
    if not dbcontract:
        raise HTTPException(status_code=404, detail=f"contract_id={request.contract_id} not found")
    contract = AnnotatedContract.model_validate(dbcontract)

    # get/create the relevant chat thread for the agent run
    # NOTE: conversation state/history is managed server-side via the OpenAI Conversations API
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

    # add the new user message to the database
    user_message = DBAgentChatMessage(
        contract_id=contract.id, 
        chat_thread_id=chat_thread.id, 
        status=ChatMessageStatus.COMPLETED,
        role=ChatMessageRole.USER, 
        content=request.content
    )
    db.add(user_message)
    await db.flush()

    # add the new assistant message to the database 
    # NOTE: we mark the new assistant message as pending and set it's content to a default value to be updated via the event stream handler
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
    agent_context = AgentContext(db=db, contract=contract)
    stream_context = AgentRunEventStreamContext(db=db, contract=contract, chat_thread_id=chat_thread.id, user_message_id=user_message.id, assistant_message_id=assistant_message.id)

    # execute the agent run with the user's current input, conversation history, and dynamic agent runtime context
    result = Runner.run_streamed(
        starting_agent=agent, 
        conversation_id=chat_thread.openai_conversation_id,
        input=request.content, 
        context=agent_context,
        max_turns=20
    )

    # commit the initial user/assistant messages to the database and return the event stream response
    await db.commit()
    return EventSourceResponse(handle_event_stream(event_stream=result.stream_events(), context=stream_context))


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
