from typing import Literal, Optional, TypedDict, Union

from app.common.schemas import ConfiguredBaseModel
from app.features.workflows.schemas import JobStatusUpdate


class RedisPubSubMessage(TypedDict):
    type: Literal['message', 'pmessage', 'subscribe', 'unsubscribe', 'psubscribe', 'punsubscribe']
    pattern: Optional[str]
    channel: str
    data: str

class NotificationEvent(ConfiguredBaseModel):
    event: Literal["ingestion", "analysis"]
    data: Union[JobStatusUpdate]
