import logging

from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker
from taskiq import TaskiqEvents, TaskiqState

from app.core.config import settings
from app.features.notifications.client import get_notifications_client, close_notifications_client


logger = logging.getLogger(__name__)


backend = RedisAsyncResultBackend(
    redis_url=str(settings.redis_url),
    result_ex_time=settings.taskiq_result_ex_time
)
broker = RedisStreamBroker(
    url=str(settings.redis_url),
    queue_name=settings.taskiq_queue_name,
    consumer_group_name=settings.taskiq_consumer_group_name,
    unacknowledged_batch_size=settings.taskiq_unacknowledged_batch_size,
    xread_count=settings.taskiq_xread_count
).with_result_backend(backend)


@broker.on_event(TaskiqEvents.WORKER_STARTUP)
async def worker_startup(state: TaskiqState):
    await get_notifications_client()

@broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
async def worker_shutdown(state: TaskiqState):
    await close_notifications_client()
