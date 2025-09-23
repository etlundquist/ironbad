import asyncio
import tiktoken
import logging

from tempfile import NamedTemporaryFile

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker

from openai import AsyncOpenAI
from openai.types import CreateEmbeddingResponse

from app.ingestion import parse_contract
from app.dbmodels import Contract as DBContract, ContractSection
from app.models import ContractIngestionJob, ParsedContractSection
from app.database import engine
from app.utils import string_truncate, with_semaphore
from app.enums import ContractStatus


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


async def get_section_embeddings(sections: list[ParsedContractSection]) -> list[list[float]]:
    """get vector embeddings for a list of contract sections"""

    openai = AsyncOpenAI()
    section_texts = [string_truncate(f"{section.number} {section.name}\n{section.markdown}", max_tokens=8192, tokenizer=encoding) for section in sections]
    section_tasks = [with_semaphore(openai.embeddings.create(input=text, model="text-embedding-3-small"), openai_semaphore) for text in section_texts]
    section_responses: list[CreateEmbeddingResponse|Exception] = await asyncio.gather(*section_tasks, return_exceptions=True)
    section_embeddings: list[list[float]] = [response.data[0].embedding if isinstance(response, CreateEmbeddingResponse) else None for response in section_responses]
    return section_embeddings


@broker.task()
async def ingest_contract(contract_ingestion_job: ContractIngestionJob) -> None:
    """parse/ingest a contract and update it's status"""

    async with AsyncSession(engine) as db:

        # fetch the relevant contract record from the database
        query = select(DBContract).where(DBContract.id == contract_ingestion_job.contract_id)
        result = await db.execute(query)
        contract = result.scalar_one()

        # parse the contract into text/sections
        with NamedTemporaryFile(delete=True, mode='wb') as f:
            f.write(contract.contents)
            f.flush()
            try:
                # parse the contract into markdown text and structured sections
                parsed_contract = await parse_contract(path=f.name)
                contract.markdown = parsed_contract.markdown
                # generate vector embeddings for the structured sections
                top_level_sections = [section for section in parsed_contract.sections if section.level == 1]
                section_embeddings = await get_section_embeddings(sections=top_level_sections)
                for section, embedding in zip(top_level_sections, section_embeddings):
                    if embedding:
                        section.embedding = embedding
                # add the structured sections to the database with the embeddings
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
                # update the contract status to ingested and commit the changes
                contract.status = ContractStatus.INGESTED
                await db.commit()
            except Exception as e:
                # update the contract status to error and record the error message
                logger.error(f"failed to parse contract: {contract.id} ({contract.filename})", exc_info=True)
                contract.status = ContractStatus.ERROR
                contract.errors = [{"type": "ingestion", "message": str(e)}]
                await db.commit()


# async def main():
#     task = await best_task_ever.kiq()
#     print(await task.wait_result())
