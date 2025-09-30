from enum import Enum

class ContractStatus(Enum):
    UPLOADED = "Uploaded"
    PROCESSING = "Processing"
    READY_FOR_REVIEW = "Ready for Review"
    UNDER_REVIEW = "Under Review"
    REVIEW_COMPLETED = "Review Completed"


class FileType(Enum):
    PDF = "application/pdf"

class ContractSectionType(Enum):
    PREAMBLE = "preamble"
    BODY = "body"
    APPENDIX = "appendix"

class JobStatus(Enum):
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"

class RuleSeverity(Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class IssueStatus(Enum):
    OPEN = "open"
    RESOLVED = "resolved"

class IssueResolution(Enum):
    IGNORE = "ignore"
    SUGGEST_REVISION = "suggest_revision"

class ChatMessageStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"

class ChatMessageRole(Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
