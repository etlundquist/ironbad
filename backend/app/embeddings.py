import asyncio
import tiktoken
import logging

from openai import AsyncOpenAI
from openai.types import CreateEmbeddingResponse

from app.schemas import ParsedContractSection, StandardClause
from app.utils import string_truncate, with_semaphore


logger = logging.getLogger(__name__)
encoding = tiktoken.encoding_for_model("gpt-4o")
openai_semaphore = asyncio.Semaphore(10)


async def get_text_embedding(text: str) -> list[float]:
    """get a vector embedding for arbitrary text"""

    openai = AsyncOpenAI()
    truncated_text = string_truncate(text, max_tokens=8192, tokenizer=encoding)
    response: CreateEmbeddingResponse = await with_semaphore(openai.embeddings.create(input=truncated_text, model="text-embedding-3-small"), openai_semaphore)
    return response.data[0].embedding


async def get_clause_embeddings(clauses: list[StandardClause]) -> list[list[float]]:
    """get vector embeddings for a list of standard clauses"""

    openai = AsyncOpenAI()
    clause_texts = [string_truncate(f"{clause.display_name}\n{clause.standard_text}", max_tokens=8192, tokenizer=encoding) for clause in clauses]
    clause_tasks = [with_semaphore(openai.embeddings.create(input=text, model="text-embedding-3-small"), openai_semaphore) for text in clause_texts]
    clause_responses: list[CreateEmbeddingResponse|Exception] = await asyncio.gather(*clause_tasks, return_exceptions=True)
    clause_embeddings: list[list[float]] = [response.data[0].embedding if isinstance(response, CreateEmbeddingResponse) else None for response in clause_responses]
    return clause_embeddings


async def get_section_embeddings(sections: list[ParsedContractSection]) -> list[list[float]]:
    """get vector embeddings for a list of contract sections"""

    openai = AsyncOpenAI()
    section_texts = [string_truncate(section.markdown, max_tokens=8192, tokenizer=encoding) for section in sections]
    section_tasks = [with_semaphore(openai.embeddings.create(input=text, model="text-embedding-3-small"), openai_semaphore) for text in section_texts]
    section_responses: list[CreateEmbeddingResponse|Exception] = await asyncio.gather(*section_tasks, return_exceptions=True)
    section_embeddings: list[list[float]] = [response.data[0].embedding if isinstance(response, CreateEmbeddingResponse) else None for response in section_responses]
    return section_embeddings
