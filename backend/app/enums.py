from enum import Enum

class ContractStatus(Enum):
    UPLOADED = "uploaded"
    ANALYZING = "ingested"
    COMPLETE = "analyzed"
    ERROR = "error"

class FileType(Enum):
    PDF = "application/pdf"

class ContractType(Enum):
    MSA = "Master Service Agreement"
    SOW = "Statement of Work"
    PO = "Purchase Order"

class SectionType(Enum):
    PREAMBLE = "preamble"
    BODY = "body"
    ATTACHMENT = "attachment"
    EXHIBIT = "exhibit"
