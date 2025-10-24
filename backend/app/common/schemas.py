
from uuid import UUID
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

from app.enums import ContractSectionType, ContractStatus, FileType


class ConfiguredBaseModel(BaseModel):
    class Config:
        from_attributes = True
        arbitrary_types_allowed = True

class ContractStructuredMetadata(ConfiguredBaseModel):
    document_type: Literal["Master Agreement", "Statement of Work", "Purchase Order", "Other"]
    document_title: Optional[str] = None
    customer_name: Optional[str] = None
    supplier_name: Optional[str] = None
    effective_date: Optional[str] = None
    initial_term: Optional[str] = None

class ContractMetadata(ContractStructuredMetadata):
    summary: Optional[str] = None

class ContractSectionNode(ConfiguredBaseModel):
    id: str
    type: ContractSectionType
    level: int
    number: str
    name: Optional[str] = None
    markdown: str
    parent_id: Optional[str] = None
    children: Optional[list["ContractSectionNode"]] = Field(default_factory=list)

    def get_node_by_id(self, node_id: str) -> "ContractSectionNode":
        """find a given node in the tree by its ID"""

        if self.id == node_id:
            return self
        for child in self.children or []:
            try:
                return child.get_node_by_id(node_id)
            except ValueError:
                continue
        raise ValueError(f"node_id={node_id} not found")

class Contract(ConfiguredBaseModel):
    id: UUID
    status: ContractStatus
    filename: str
    filetype: FileType
    markdown: Optional[str] = Field(default=None, exclude=True)
    section_tree: Optional[ContractSectionNode] = None
    version: int = 1
    meta: Optional[ContractMetadata] = None
    errors: Optional[list[dict]] = None
    created_at: datetime
    updated_at: datetime
