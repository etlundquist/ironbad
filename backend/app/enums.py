from enum import Enum

class ContractStatus(Enum):
    UPLOADED = "Uploaded"
    INGESTING = "Ingesting"
    READY_FOR_REVIEW = "Ready for Review"
    ANALYZING = "Analyzing"
    UNDER_REVIEW = "Under Review"
    REVIEW_COMPLETED = "Review Completed"


class FileType(Enum):
    PDF = "application/pdf"
    DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

class ContractSectionType(Enum):
    ROOT = "root"
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
