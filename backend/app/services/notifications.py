import logging

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from redis import asyncio as aioredis
from redis.asyncio.client import PubSub

from app.schemas import NotificationEvent


logger = logging.getLogger(__name__)


REDIS_URL = "redis://redis:6379"
NOTIFICATIONS_CHANNEL = "notifications"


class NotificationsClient:
    """client wrapper for Redis pub/sub notifications"""

    def __init__(self, redis_url: str = REDIS_URL):
        """initialize a Redis client with an async connection pool"""

        self.redis = aioredis.from_url(
            url=redis_url,
            decode_responses=True,
            max_connections=100,
            socket_connect_timeout=5,
            retry_on_timeout=True
        )

    async def publish(self, channel: str, event: NotificationEvent) -> None:
        """publish a notification"""

        message = event.model_dump_json()
        await self.redis.publish(channel, message)

    async def subscribe(self, channel: str):
        """subscribe to a channel to get notifications [async for message in pubsub.listen():]"""

        pubsub = self.redis.pubsub()
        await pubsub.subscribe(channel)
        return pubsub

    async def unsubscribe(self, pubsub: PubSub, channel: str) -> None:
        """unsubscribe from a channel to stop getting notifications"""

        try:
            await pubsub.unsubscribe(channel)
        finally:
            await pubsub.close()

    async def close(self) -> None:
        """close the Redis connection"""

        await self.redis.close()


notifications_client: NotificationsClient | None = None
"""global singleton instance of the NotificationsClient"""


async def get_notifications_client() -> NotificationsClient:
    """get the global singleton notifications client as a dependency"""

    global notifications_client
    if notifications_client is None:
        notifications_client = NotificationsClient(redis_url=REDIS_URL)
    return notifications_client


async def close_notifications_client() -> None:
    """close the global singleton notifications client"""

    global notifications_client
    if notifications_client is not None:
        await notifications_client.close()
        notifications_client = None


@asynccontextmanager
async def get_pubsub(channel: str = NOTIFICATIONS_CHANNEL) -> AsyncGenerator[PubSub, None]:
    """get a pubsub connection subscribed to a specific channel"""

    client = await get_notifications_client()
    pubsub = await client.subscribe(channel)

    try:
        yield pubsub
    finally:
        await client.unsubscribe(pubsub=pubsub, channel=channel)
