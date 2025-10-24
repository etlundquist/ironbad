from contextlib import asynccontextmanager
from typing import AsyncGenerator

from redis.asyncio.client import PubSub

from app.core.config import settings
from app.features.notifications.client import get_notifications_client


@asynccontextmanager
async def get_pubsub(channel: str | None = None) -> AsyncGenerator[PubSub, None]:
    """get a pubsub connection subscribed to a specific channel"""

    channel = channel or settings.redis_notifications_channel
    client = await get_notifications_client()
    pubsub = await client.subscribe(channel)

    try:
        yield pubsub
    finally:
        await client.unsubscribe(pubsub=pubsub, channel=channel)
