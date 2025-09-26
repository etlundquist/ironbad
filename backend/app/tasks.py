import logging

from datetime import datetime
from tempfile import NamedTemporaryFile

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker

from app.workflows.ingestion import parse_contract, extract_clauses
from app.models import Contract as DBContract, ContractSection, ContractClause, StandardClause
from app.schemas import ContractIngestionJob
from app.database import engine
from app.enums import ContractStatus


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


@broker.task()
async def ingest_contract(job: ContractIngestionJob) -> None:
    """parse/ingest a contract and update it's status"""

    async with AsyncSession(engine) as db:

        # get the contract record from the database
        query = select(DBContract).where(DBContract.id == job.contract_id)
        result = await db.execute(query)
        contract = result.scalar_one()

        # get the up-to-date set of standard clauses to map/extract
        query = select(StandardClause)
        result = await db.execute(query)
        standard_clauses = result.scalars().all()

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
                for section in parsed_contract.sections
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
