from uuid import UUID
from datetime import datetime
from typing import Optional, Union, Literal

from pydantic import Field

from app.common.schemas import ConfiguredBaseModel, ContractSectionNode, Contract
from app.enums import AnnotationStatus, AnnotationType, ContractActionType, ContractAnnotationResolution, AnnotationAuthor


class CommentAnnotation(ConfiguredBaseModel):
    id: UUID
    node_id: str
    offset_beg: int
    offset_end: int
    anchor_text: str
    comment_text: str
    author: AnnotationAuthor
    status: AnnotationStatus = AnnotationStatus.PENDING
    created_at: datetime
    resolved_at: Optional[datetime] = None

class RevisionAnnotation(ConfiguredBaseModel):
    id: UUID
    node_id: str
    offset_beg: int
    offset_end: int
    old_text: str
    new_text: str
    author: AnnotationAuthor
    status: AnnotationStatus = AnnotationStatus.PENDING
    created_at: datetime
    resolved_at: Optional[datetime] = None

class SectionAddAnnotation(ConfiguredBaseModel):
    id: UUID
    target_parent_id: str
    insertion_index: int
    new_node: ContractSectionNode
    author: AnnotationAuthor
    status: AnnotationStatus = AnnotationStatus.PENDING
    created_at: datetime
    resolved_at: Optional[datetime] = None

class SectionRemoveAnnotation(ConfiguredBaseModel):
    id: UUID
    node_id: str
    author: AnnotationAuthor
    status: AnnotationStatus = AnnotationStatus.PENDING
    created_at: datetime
    resolved_at: Optional[datetime] = None

ContractAnnotation = Union[CommentAnnotation, RevisionAnnotation, SectionAddAnnotation, SectionRemoveAnnotation]

class ContractAnnotations(ConfiguredBaseModel):
    comments: list[CommentAnnotation] = Field(default_factory=list)
    revisions: list[RevisionAnnotation] = Field(default_factory=list)
    section_adds: list[SectionAddAnnotation] = Field(default_factory=list)
    section_removes: list[SectionRemoveAnnotation] = Field(default_factory=list)

    def get_annotation_by_id(self, annotation_id: UUID) -> ContractAnnotation:
        """get an annotation by ID and type"""

        annotations = self.comments + self.revisions + self.section_adds + self.section_removes
        try:
            return next(annotation for annotation in annotations if annotation.id == annotation_id)
        except StopIteration:
            raise ValueError(f"{annotation_id=} not found in annotations")


class NewCommentAnnotationRequest(ConfiguredBaseModel):
    node_id: str
    offset_beg: int
    offset_end: int
    anchor_text: str
    comment_text: str
    author: AnnotationAuthor = AnnotationAuthor.USER

class EditCommentAnnotationRequest(ConfiguredBaseModel):
    annotation_id: UUID
    comment_text: str

class NewRevisionAnnotationRequest(ConfiguredBaseModel):
    node_id: str
    offset_beg: int
    offset_end: int
    old_text: str
    new_text: str
    author: AnnotationAuthor = AnnotationAuthor.USER

class EditRevisionAnnotationRequest(ConfiguredBaseModel):
    annotation_id: UUID
    new_text: str

class SectionAddAnnotationRequest(ConfiguredBaseModel):
    target_parent_id: str
    insertion_index: int
    new_node: ContractSectionNode
    author: AnnotationAuthor = AnnotationAuthor.USER

class SectionRemoveAnnotationRequest(ConfiguredBaseModel):
    node_id: str
    author: AnnotationAuthor = AnnotationAuthor.USER

class ContractActionRequest(ConfiguredBaseModel):
    action: ContractActionType
    data: Union[NewCommentAnnotationRequest, EditCommentAnnotationRequest, NewRevisionAnnotationRequest, EditRevisionAnnotationRequest, SectionAddAnnotationRequest, SectionRemoveAnnotationRequest]

class ContractActionResponse(ConfiguredBaseModel):
    # top-level action information
    status: Literal["applied", "rejected", "conflict"]
    action: ContractActionType
    action_id: UUID
    new_contract_version: int
    # contract tree/text changes
    updated_nodes: list[ContractSectionNode] = Field(default_factory=list)
    deleted_node_ids: list[str] = Field(default_factory=list)
    # contract annotation changes
    updated_annotations: ContractAnnotations = Field(default_factory=ContractAnnotations)
    rebased_annotations: ContractAnnotations = Field(default_factory=ContractAnnotations)


class AnnotationResolutionRequest(ConfiguredBaseModel):
    annotation_id: UUID
    annotation_type: AnnotationType
    resolution: ContractAnnotationResolution

class AnnotationResolutionResponse(ConfiguredBaseModel):
    # top-level action information
    status: Literal["applied", "rejected", "conflict"]
    annotation_id: UUID
    annotation_type: AnnotationType
    resolution: ContractAnnotationResolution
    new_contract_version: int
    # updated state after applying the resolution
    updated_annotations: ContractAnnotations = Field(default_factory=ContractAnnotations)
    updated_nodes: list[ContractSectionNode] = Field(default_factory=list)
    rebased_annotations: ContractAnnotations = Field(default_factory=ContractAnnotations)

class AnnotationDeleteResponse(ConfiguredBaseModel):
    status: Literal["applied", "rejected", "conflict"]
    annotation_id: UUID
    new_contract_version: int
    updated_annotations: ContractAnnotations = Field(default_factory=ContractAnnotations)


class AnnotatedContract(Contract):
    annotations: Optional[ContractAnnotations] = None
