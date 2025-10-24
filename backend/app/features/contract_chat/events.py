import logging

from uuid import UUID
from typing import AsyncGenerator

from sse_starlette import ServerSentEvent

from openai import AsyncStream
from openai.types.responses import ResponseStreamEvent, ResponseInProgressEvent, ResponseCompletedEvent, ResponseFailedEvent, ResponseTextDeltaEvent

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ContractChatMessage
from app.enums import ChatMessageStatus
from app.features.contract_chat.schemas import ChatInitEventData, ChatMessage, ChatMessageEvent, ChatMessageStatusUpdate, ChatMessageTokenDelta

from app.core.db import SessionLocal
from app.features.contract_chat.services import extract_response_citations


logger = logging.getLogger(__name__)


async def stream_chat_response(
    contract_id: UUID,
    chat_thread_id: UUID,
    user_message_id: UUID,
    assistant_message_id: UUID,
    response_stream: AsyncStream[ResponseStreamEvent]
) -> AsyncGenerator[ServerSentEvent, None]:
    """generator function to stream the chat response as server-sent events and update the database accordingly"""

    # send an initialization event with thread id, full user message, and pending assistant message
    async with SessionLocal() as db:
        db: AsyncSession
        user_message = await db.get(ContractChatMessage, user_message_id)
        assistant_message = await db.get(ContractChatMessage, assistant_message_id)
        init_event = ChatMessageEvent(
            event="init",
            data=ChatInitEventData(
                chat_thread_id=chat_thread_id,
                user_message=ChatMessage.model_validate(user_message),
                assistant_message=ChatMessage.model_validate(assistant_message)
            )
        )
    yield ServerSentEvent(event=init_event.event, data=init_event.data.model_dump_json())

    # iterate over the response stream making database updates and sending events to the client
    async for event in response_stream:
        event: ResponseStreamEvent
        if isinstance(event, ResponseInProgressEvent):
            # send an event indicating the response is in progress
            status_update_event = ChatMessageEvent(
                event="message_status_update",
                data=ChatMessageStatusUpdate(
                    chat_thread_id=chat_thread_id,
                    chat_message_id=assistant_message_id,
                    status=ChatMessageStatus.IN_PROGRESS
                )
            )
            yield ServerSentEvent(event=status_update_event.event, data=status_update_event.data.model_dump_json())
        elif isinstance(event, ResponseTextDeltaEvent):
            # send an event with the next token of the response content
            token_delta_event = ChatMessageEvent(
                event="message_token_delta",
                data=ChatMessageTokenDelta(
                    chat_thread_id=chat_thread_id,
                    chat_message_id=assistant_message_id,
                    delta=event.delta
                )
            )
            yield ServerSentEvent(event=token_delta_event.event, data=token_delta_event.data.model_dump_json())
        elif isinstance(event, ResponseCompletedEvent):
            # send an event indicating the response is complete
            status_update_event = ChatMessageEvent(
                event="message_status_update",
                data=ChatMessageStatusUpdate(
                    chat_thread_id=chat_thread_id,
                    chat_message_id=assistant_message_id,
                    status=ChatMessageStatus.COMPLETED
                )
            )
            yield ServerSentEvent(event=status_update_event.event, data=status_update_event.data.model_dump_json())
            # resolve the citations, update the complete assistant message in the database, and send the full complete assistant message
            async with SessionLocal() as db:
                db: AsyncSession
                assistant_message = await db.get(ContractChatMessage, assistant_message_id)
                response_citations = await extract_response_citations(db, contract_id, event.response.output_text)
                assistant_message.status = ChatMessageStatus.COMPLETED
                assistant_message.content = event.response.output_text
                assistant_message.citations = [citation.model_dump() for citation in response_citations]
                assistant_message_event = ChatMessageEvent(event="assistant_message", data=ChatMessage.model_validate(assistant_message))
                await db.commit()
            yield ServerSentEvent(event=assistant_message_event.event, data=assistant_message_event.data.model_dump_json())
        elif isinstance(event, ResponseFailedEvent):
            # send an event indicating the response failed, update the message in the database, and send the full failed assistant message
            logger.info(f"response failed event: {event.response.error}")
            status_update_event = ChatMessageEvent(
                event="message_status_update",
                data=ChatMessageStatusUpdate(
                    chat_thread_id=chat_thread_id,
                    chat_message_id=assistant_message_id,
                    status=ChatMessageStatus.FAILED
                )
            )
            yield ServerSentEvent(event=status_update_event.event, data=status_update_event.data.model_dump_json())
            # update the failed assistant message in the database and send the full failed assistant message
            async with SessionLocal() as db:
                db: AsyncSession
                assistant_message = await db.get(ContractChatMessage, assistant_message_id)
                assistant_message.status = ChatMessageStatus.FAILED
                assistant_message.content = "There was an error generating the response. Please try again."
                assistant_message_event = ChatMessageEvent(event="assistant_message", data=ChatMessage.model_validate(assistant_message))
                await db.commit()
            yield ServerSentEvent(event=assistant_message_event.event, data=assistant_message_event.data.model_dump_json())

