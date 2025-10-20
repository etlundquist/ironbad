import json
import logging

from typing import AsyncGenerator, Optional, Literal, TypedDict

from fastapi import APIRouter
from sse_starlette import EventSourceResponse, ServerSentEvent

from app.services.notifications import get_pubsub
from app.schemas import NotificationEvent


router = APIRouter()
logger = logging.getLogger(__name__)


class PubSubMessage(TypedDict):
    type: Literal['message', 'pmessage', 'subscribe', 'unsubscribe', 'psubscribe', 'punsubscribe']
    pattern: Optional[str]
    channel: str
    data: str


@router.get("/notifications", tags=["notifications"])
async def notifications() -> EventSourceResponse:
    """long-lived SSE endpoint to send notifications for each client connection"""

    async def stream_notifications() -> AsyncGenerator[ServerSentEvent, None]:
        """listen for messages, validate the payload, and yield the corresponding server-sent event"""

        async with get_pubsub() as pubsub:
            async for message in pubsub.listen():
                try:
                    message: PubSubMessage
                    if message["type"] == "message":
                        notification_event = NotificationEvent.model_validate(json.loads(message["data"]))
                        yield ServerSentEvent(event=notification_event.event, data=notification_event.data.model_dump_json())
                except Exception:
                    logger.error("error in SSE stream", exc_info=True)

    return EventSourceResponse(stream_notifications())
