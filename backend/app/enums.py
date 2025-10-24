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
    QUEUED = "queued"
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"

class ChatMessageRole(Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"

class AnnotationStatus(Enum):
    PENDING = "pending"
    RESOLVED = "resolved"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CONFLICT = "conflict"
    STALE = "stale"

class AnnotationAuthor(Enum):
    USER = "User"
    AGENT = "Agent"

class AnnotationType(Enum):
    COMMENT = "comment"
    REVISION = "revision"
    SECTION_ADD = "section_add"
    SECTION_REMOVE = "section_remove"

class ContractActionType(Enum):
    MAKE_COMMENT = "make_comment"
    EDIT_COMMENT = "edit_comment"
    MAKE_REVISION = "make_revision"
    EDIT_REVISION = "edit_revision"
    SECTION_ADD = "section_add"
    SECTION_REMOVE = "section_remove"

class ContractAnnotationResolution(Enum):
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    RESOLVED = "resolved"
