import logging
import asyncio

from agents import RunConfig, Runner
from openai import AsyncOpenAI
from openai.types.responses import EasyInputMessage, EasyInputMessageParam, ResponseInputItem, ResponseInputItemParam, ResponseInputTextParam
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import engine
from app.core.broker import broker 
from app.utils.common import with_semaphore
from app.models import Contract as DBContract

from app.features.contract_annotations.schemas import AnnotatedContract
from app.features.contract_agent.agent import AgentContext, agent
from app.features.contract_agent.schemas import AgentEvalTaskInput, AgentEvalJob, AgentEvalOutputCase, AgentEvalTaskOutput, AgentRunRequest
from app.features.contract_agent.services import process_request_attachments


logger = logging.getLogger(__name__)
sema = asyncio.Semaphore(5)


@broker.task()
async def run_agent_evaluation(job: AgentEvalJob) -> None:
    """evaluate the agent with respect to the input dataset of test cases and pre-configured eval graders"""

    # run the agent for each test case in the dataset
    agent_task_inputs = [
        AgentEvalTaskInput(
            contract_filename=case.contract_filename, 
            user_message=case.user_message, 
            user_message_attachments=case.user_message_attachments
        ) for case in job.dataset.cases
    ]
    agent_task_outputs: list[AgentEvalTaskOutput] = await asyncio.gather(*[
        with_semaphore(run_agent_sync(task_input=agent_task_input), sema) 
        for agent_task_input in agent_task_inputs
    ])
    output_cases = [
        AgentEvalOutputCase(
            **input_case.model_dump(), 
            **task_output.model_dump()
        )
        for input_case, task_output in zip(job.dataset.cases, agent_task_outputs)
    ]

    # create a new evaluation run applying the configured graders against the inputs/outputs of the agent runs
    openai = AsyncOpenAI()
    eval_run = await openai.evals.runs.create(
        eval_id=job.eval_id,
        name=job.run_name,
        data_source={
            "type": "jsonl",
            "source": {
                "type": "file_content",
                "content": [{"item": output_case.model_dump(exclude_unset=True)} for output_case in output_cases]
            }
        }
    )
    logger.info(f"created eval_run: {eval_run.id}")


async def run_agent_sync(task_input: AgentEvalTaskInput) -> AgentEvalTaskOutput:
    """create and execute a new agent task synchronously returning a RunResult object with the input and all output items"""

    async with AsyncSession(engine) as db:

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
        run_config = RunConfig(workflow_name="Agent Evaluation Run")

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
