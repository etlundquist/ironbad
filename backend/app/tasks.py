import json
import logging

from datetime import datetime
from tempfile import NamedTemporaryFile

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker
from taskiq import TaskiqEvents, TaskiqState

from app.workflows.ingestion import parse_contract, extract_clauses
from app.workflows.analysis import extract_issues
from app.models import Contract as DBContract, ContractSection, ContractClause, StandardClause, ContractIssue
from app.schemas import ContractAnnotations, ContractIngestionJob, ContractAnalysisJob, JobStatusUpdate, NotificationEvent
from app.enums import ContractStatus, JobStatus
from app.database import engine
from app.services.notifications import NOTIFICATIONS_CHANNEL, get_notifications_client, close_notifications_client

logger = logging.getLogger(__name__)

backend = RedisAsyncResultBackend(
    redis_url="redis://redis:6379",
    result_ex_time=3600
)
broker = RedisStreamBroker(
    url="redis://redis:6379",
    queue_name="ingestion",
    consumer_group_name="ingestion",
    unacknowledged_batch_size=1,
    xread_count=1
).with_result_backend(backend)


@broker.on_event(TaskiqEvents.WORKER_STARTUP)
async def worker_startup(state: TaskiqState):
    await get_notifications_client()

@broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
async def worker_shutdown(state: TaskiqState):
    await close_notifications_client()


@broker.task()
async def ingest_contract(job: ContractIngestionJob) -> None:
    """parse/ingest a contract and update it's status"""

    async with AsyncSession(engine) as db:

        # get the contract record from the database
        query = select(DBContract).where(DBContract.id == job.contract_id)
        result = await db.execute(query)
        contract = result.scalar_one()
        contract_id = contract.id

        # get the up-to-date set of standard clauses to map/extract
        query = select(StandardClause)
        result = await db.execute(query)
        standard_clauses = result.scalars().all()

        # get the notifications client to send job progress updates
        notifications_client = await get_notifications_client()

        # log the start time for contract ingestion
        logger.info(f"*** ingesting contract: {contract.filename} ({contract.id}) ***")
        beg_time = datetime.now()

        try:

            # convert the PDF/DOCX contract to markdown and extract metadata and structured sections
            with NamedTemporaryFile(delete=True, mode='wb') as f:
                f.write(contract.contents)
                f.flush()
                parsed_contract = await parse_contract(path=f.name)
                contract.markdown = parsed_contract.markdown
                contract.section_tree = json.loads(parsed_contract.section_tree.model_dump_json())
                contract.annotations = json.loads(ContractAnnotations().model_dump_json())
                contract.meta = parsed_contract.metadata.model_dump()
                await db.flush()

            # add the structured contract sections to the database
            contract_sections = [
                ContractSection(
                    contract_id=contract.id,
                    type=section.type,
                    level=section.level,
                    number=section.number,
                    name=section.name,
                    markdown=section.markdown,
                    embedding=section.embedding,
                    beg_page=section.beg_page,
                    end_page=section.end_page
                )
                for section in parsed_contract.section_list
            ]
            db.add_all(contract_sections)
            await db.flush()

            # extract standard clauses from the parsed contract sections
            contract_clauses = await extract_clauses(db, contract, standard_clauses)
            db.add_all(contract_clauses)
            await db.flush()

            # if ingestion was successful then progress the contract to the next state and commit all changes to the database
            duration = datetime.now() - beg_time
            contract.status = ContractStatus.READY_FOR_REVIEW
            logger.info(f"*** contract ingestion ({contract.id}: {contract.filename}) successful! ({duration}) ***")
            await db.commit()

            # send a notification that the contract ingestion was successful
            status_update = JobStatusUpdate(contract_id=contract_id, status=JobStatus.COMPLETED, timestamp=datetime.now())
            await notifications_client.publish(channel=NOTIFICATIONS_CHANNEL, event=NotificationEvent(event="ingestion", data=status_update))

        except Exception as e:

            # if ingestion failed then leave the contract in the current state and discard all extracted sections and clauses
            logger.error(f"*** contract ingestion ({contract.id}: {contract.filename}) failed! discarding extracted sections and clauses ***", exc_info=True)
            await db.execute(delete(ContractSection).where(ContractSection.contract_id == contract.id))
            await db.execute(delete(ContractClause).where(ContractClause.contract_id == contract.id))

            # record the error and discard any extracted markdown, sections, and clauses
            contract.errors = [{"step": "ingestion", "message": str(e)}]
            contract.markdown = None
            contract.meta = None
            await db.commit()

            # send a notification that the contract ingestion failed
            status_update = JobStatusUpdate(contract_id=contract_id, status=JobStatus.FAILED, errors=[{"step": "ingestion", "message": str(e)}], timestamp=datetime.now())
            await notifications_client.publish(channel=NOTIFICATIONS_CHANNEL, event=NotificationEvent(event="ingestion", data=status_update))



@broker.task()
async def analyze_contract(job: ContractAnalysisJob) -> None:
    """identify issues with a contract and update it's status"""

    async with AsyncSession(engine) as db:

        # get the contract record from the database
        query = select(DBContract).where(DBContract.id == job.contract_id)
        result = await db.execute(query)
        contract = result.scalar_one()
        contract_id = contract.id

        # get the up-to-date set of standard clauses to evaluate
        query = select(StandardClause)
        result = await db.execute(query)
        standard_clauses = result.scalars().all()

        # get the notifications client to send job progress updates
        notifications_client = await get_notifications_client()

        # log the start time for issue identification
        logger.info(f"*** analyzing contract: {contract.filename} ({contract.id}) ***")
        beg_time = datetime.now()

        try:

            # extract all issues with the contract with respect to the standard clauses
            contract_issues = await extract_issues(db, contract, standard_clauses)
            db.add_all(contract_issues)

            # if issue identification was successful then progress the contract to the next state and commit all changes to the database
            duration = datetime.now() - beg_time
            contract.status = ContractStatus.UNDER_REVIEW
            logger.info(f"*** contract analysis ({contract.id}: {contract.filename}) successful! ({duration}) ***")
            await db.commit()

            # send a notification that the contract analysis was successful
            status_update = JobStatusUpdate(contract_id=contract_id, status=JobStatus.COMPLETED, timestamp=datetime.now())
            await notifications_client.publish(channel=NOTIFICATIONS_CHANNEL, event=NotificationEvent(event="analysis", data=status_update))

        except Exception as e:

            # if issue identification failed then leave the contract in the current state and discard all extracted issues
            logger.error(f"*** contract analysis ({contract.id}: {contract.filename}) failed! discarding extracted issues ***", exc_info=True)
            await db.execute(delete(ContractIssue).where(ContractIssue.contract_id == contract.id))

            # record the error and discard any extracted issues
            contract.errors = [{"step": "analysis", "message": str(e)}]
            await db.commit()

            # send a notification that the contract analysis failed
            status_update = JobStatusUpdate(contract_id=contract_id, status=JobStatus.FAILED, errors=[{"step": "analysis", "message": str(e)}], timestamp=datetime.now())
            await notifications_client.publish(channel=NOTIFICATIONS_CHANNEL, event=NotificationEvent(event="analysis", data=status_update))
