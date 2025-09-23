import re
import asyncio
import logging
import tiktoken

from typing import Optional
from types import CoroutineType
from tiktoken import Encoding


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def with_semaphore(coro: CoroutineType, sema: asyncio.Semaphore) -> asyncio.Future:
    """wrapper function to run a coroutine with a semaphore to limit concurrency"""

    async with sema:
        return await coro


def string_sanitize(string: str) -> str:
    """remove markdown block wrappers and non-printable control characters (except \r, \n, \t) from the input string"""

    result = re.sub(r"[\x00-\x08\x0B-\x0C\x0E-\x1F]", "", string)
    result = result.replace("```json", "").replace("```", "").strip()
    result = result.replace("\n", " ").strip()
    return result


def string_truncate(string: str, max_tokens: int = 100_000, tokenizer: Optional[Encoding] = None) -> str:
    """truncate the input string to the specified number of tokens"""

    if not tokenizer:
        tokenizer = tiktoken.get_encoding("cl100k_base")

    tokens = tokenizer.encode(string)
    token_count = len(tokens)

    if token_count > max_tokens:
        logger.info(f"truncating input string with {token_count} input tokens to {max_tokens} output tokens")
        return tokenizer.decode(tokens[:max_tokens])
    else:
        return string
