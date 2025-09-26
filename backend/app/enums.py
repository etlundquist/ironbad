from enum import Enum

class ContractStatus(Enum):
    UPLOADED = "Uploaded"
    PROCESSING = "Processing"
    READY_FOR_REVIEW = "Ready for Review"
    UNDER_REVIEW = "Under Review"
    APPROVED = "Approved"
    REJECTED = "Rejected"


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
