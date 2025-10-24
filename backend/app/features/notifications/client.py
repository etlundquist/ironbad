import logging

from redis import asyncio as aioredis
from redis.asyncio.client import PubSub

from app.core.config import settings
from app.features.notifications.schemas import NotificationEvent


logger = logging.getLogger(__name__)


class NotificationsClient:
    """client wrapper for Redis pub/sub notifications"""

    def __init__(self, redis_url: str | None = None):
        """initialize a Redis client with an async connection pool"""

        redis_url = redis_url or str(settings.redis_url)
        self.redis = aioredis.from_url(
            url=redis_url,
            decode_responses=True,
            max_connections=settings.redis_max_connections,
            socket_connect_timeout=settings.redis_socket_connect_timeout,
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
        notifications_client = NotificationsClient()
    return notifications_client


async def close_notifications_client() -> None:
    """close the global singleton notifications client"""

    global notifications_client
    if notifications_client is not None:
        await notifications_client.close()
        notifications_client = None
