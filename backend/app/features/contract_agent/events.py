import json
import logging

from asyncio import CancelledError
from typing import AsyncGenerator, AsyncIterator

from sse_starlette import ServerSentEvent
from openai.types.responses import ResponseInProgressEvent, ResponseFailedEvent, ResponseTextDeltaEvent
from agents import RawResponsesStreamEvent, RunItemStreamEvent, StreamEvent
from agents.items import  MessageOutputItem, ToolCallItem, ToolCallOutputItem, ReasoningItem

from app.enums import ChatMessageStatus
from app.models import AgentChatMessage as DBAgentChatMessage, AgentChatThread as DBAgentChatThread
from app.features.contract_agent.schemas import AgentEventStreamContext, AgentChatThread, AgentChatMessage, AgentRunCreatedEvent, AgentRunMessageStatusUpdateEvent, AgentRunMessageTokenDeltaEvent, AgentRunFailedEvent, AgentRunCompletedEvent, AgentRunCancelledEvent, AgentToolCallEvent, AgentToolCallOutputEvent, AgentReasoningSummaryEvent, ResponseCitationsAttachment
from app.features.contract_agent.services import extract_response_citations


logger = logging.getLogger(__name__)


async def handle_event_stream(event_stream: AsyncIterator[StreamEvent], context: AgentEventStreamContext) -> AsyncGenerator[ServerSentEvent, None]:
    """convert agent stream events into server-sent events and forward them to the client"""

    # send the initial run created event initializing the chat thread and user/assistant messages
    chat_thread = await context.db.get(DBAgentChatThread, context.chat_thread_id)
    user_message = await context.db.get(DBAgentChatMessage, context.user_message_id)
    assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
    run_created_event = AgentRunCreatedEvent(
        chat_thread=AgentChatThread.model_validate(chat_thread),
        user_message=AgentChatMessage.model_validate(user_message),
        assistant_message=AgentChatMessage.model_validate(assistant_message)
    )
    yield ServerSentEvent(event=run_created_event.event, data=run_created_event.model_dump_json())

    try:

        async for event in event_stream:

            # handle relevant (low-level) raw response stream events
            if isinstance(event, RawResponsesStreamEvent):
                if isinstance(event.data, ResponseInProgressEvent):
                    # send an in-progress status update event to the client
                    sse_event = AgentRunMessageStatusUpdateEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        status=ChatMessageStatus.IN_PROGRESS
                    )
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                    # update the assistant message status in the database
                    assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
                    assistant_message.status = ChatMessageStatus.IN_PROGRESS
                    await context.db.commit()
                elif isinstance(event.data, ResponseTextDeltaEvent):
                    # send a token delta event to the client to build the response content in real-time
                    sse_event = AgentRunMessageTokenDeltaEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        delta=event.data.delta
                    )
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                elif isinstance(event.data, ResponseFailedEvent):
                    # log the error details for debugging
                    logger.error(f"agent run failed: {event.data.response.error}")
                    # send a failed status update event to the client
                    sse_event = AgentRunMessageStatusUpdateEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        status=ChatMessageStatus.FAILED
                    )
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                    # update the finalized assistant message status/content in the database for the failed run
                    assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
                    assistant_message.status = ChatMessageStatus.FAILED
                    assistant_message.content = "There was an error generating the response. Please try again."
                    sse_event = AgentRunFailedEvent(assistant_message=AgentChatMessage.model_validate(assistant_message))
                    await context.db.commit()
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                    break

            # handle the (high-level) agent run item stream events
            elif isinstance(event, RunItemStreamEvent):
                if isinstance(event.item, ToolCallItem):
                    # send a tool call event to the client with the tool name and call id/args
                    sse_event = AgentToolCallEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        tool_name=event.item.raw_item.name, 
                        tool_call_id=event.item.raw_item.call_id, 
                        tool_call_args=json.loads(event.item.raw_item.arguments)
                    )
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                elif isinstance(event.item, ToolCallOutputItem):
                    # send a tool call output event to the client with the tool call id and tool call output
                    sse_event = AgentToolCallOutputEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        tool_call_id=event.item.raw_item["call_id"], 
                        tool_call_output=str(event.item.raw_item["output"])
                    )
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                elif isinstance(event.item, ReasoningItem):
                    # send a reasoning summary event to the client with the reasoning id and summary
                    sse_event = AgentReasoningSummaryEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        reasoning_id=event.item.raw_item.id, 
                        reasoning_summary="\n\n".join([summary.text for summary in event.item.raw_item.summary if summary.type == "summary_text"])
                    )
                    if sse_event.reasoning_summary.strip():
                        yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                    else:
                        logger.warning(f"reasoning item={sse_event.reasoning_id} summary is empty - skipping event emission")
                elif isinstance(event.item, MessageOutputItem):
                    # update the finalized assistant message status/content/citations in the database for the completed run
                    response_content = "".join([message.text for message in event.item.raw_item.content if message.type == "output_text"])
                    response_citations = await extract_response_citations(context.contract, response_content)
                    assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
                    assistant_message.status = ChatMessageStatus.COMPLETED
                    assistant_message.content = response_content
                    assistant_message.attachments = [ResponseCitationsAttachment(citations=response_citations).model_dump()]
                    sse_event = AgentRunCompletedEvent(assistant_message=AgentChatMessage.model_validate(assistant_message))
                    await context.db.commit()
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                    break

    except CancelledError:
        # log the cancellation for debugging and update the cancelled assistant message status/content in the database for the cancelled run
        logger.error("agent run cancelled!", exc_info=True)
        assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
        assistant_message.status = ChatMessageStatus.CANCELLED
        assistant_message.content = "The agent run was cancelled. Please try again."
        sse_event = AgentRunCancelledEvent(assistant_message=AgentChatMessage.model_validate(assistant_message))
        await context.db.commit()
        yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
    except Exception:
        # log the error details for debugging and update the failed assistant message status/content in the database for the failed run
        logger.error("agent run failed!", exc_info=True)
        assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
        assistant_message.status = ChatMessageStatus.FAILED
        assistant_message.content = "There was an error generating the response. Please try again."
        sse_event = AgentRunFailedEvent(assistant_message=AgentChatMessage.model_validate(assistant_message))
        await context.db.commit()
        yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
