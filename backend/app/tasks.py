import asyncio
import tiktoken
import logging

from tempfile import NamedTemporaryFile

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker

from app.workflows.contract_parsing import parse_contract
from app.workflows.term_extraction import extract_contract_terms

from app.dbmodels import Contract as DBContract, ContractSection, ContractTerm, StandardTerm
from app.models import ContractIngestionJob
from app.database import engine
from app.enums import ContractStatus
from app.embeddings import get_section_embeddings


logger = logging.getLogger(__name__)
encoding = tiktoken.encoding_for_model("gpt-4o")
openai_semaphore = asyncio.Semaphore(10)

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



async def extract_contract_sections(db: AsyncSession, contract: DBContract) -> None:
    """parse a contract into sections and add them to the database"""

    # parse the contract into markdown text and structured sections
    with NamedTemporaryFile(delete=True, mode='wb') as f:

        # write the contract byte contents to a temporary file for parsing
        f.write(contract.contents)
        f.flush()

        # parse the contract into markdown text and structured sections
        parsed_contract = await parse_contract(path=f.name)
        contract.markdown = parsed_contract.markdown

        # generate vector embeddings for all named sections (valid section names are typically less than 10 words)
        named_sections = [section for section in parsed_contract.sections if 1 <= len(section.name.split()) <= 10]
        section_embeddings = await get_section_embeddings(sections=named_sections)
        for section, embedding in zip(named_sections, section_embeddings):
            if embedding:
                section.embedding = embedding

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


@broker.task()
async def ingest_contract(job: ContractIngestionJob) -> None:
    """parse/ingest a contract and update it's status"""

    async with AsyncSession(engine) as db:

        # fetch the ingestion contract record from the database
        query = select(DBContract).where(DBContract.id == job.contract_id)
        result = await db.execute(query)
        contract = result.scalar_one()

        # fetch the standard set of terms to map/extract from the input contract
        query = select(StandardTerm)
        result = await db.execute(query)
        standard_terms = result.scalars().all()

        # write a message to the log at the start of the ingestion process
        logger.info(f"*** beginning contract ingestion: {contract.filename} ({contract.id}) ***")

        try:
            # parse the contract text and extract structured sections
            await extract_contract_sections(db, contract)
            # map the contract sections to create contract-specific standard terms
            await extract_contract_terms(db, contract, standard_terms)
            # if section and term extraction successful then update contract status and commit
            contract.status = ContractStatus.INGESTED
            logger.info(f"contract ingestion ({contract.id}: {contract.filename}) successful! marking contract status as ingested")
            await db.commit()
        except Exception as e:
            logger.error(f"contract ingestion ({contract.id}: {contract.filename}) failed! deleting extracted sections and terms", exc_info=True)
            await db.execute(delete(ContractSection).where(ContractSection.contract_id == contract.id))
            await db.execute(delete(ContractTerm).where(ContractTerm.contract_id == contract.id))
            contract.status = ContractStatus.ERROR
            contract.errors = [{"type": "ingestion", "message": str(e)}]
            contract.markdown = None
            await db.commit()
