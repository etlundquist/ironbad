from datetime import datetime
import json
import logging

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Contract as DBContract
from app.schemas import CommentAnnotation, Contract, ContractActionRequest, ContractActionResponse, ContractAnnotations, ContractSectionNode, EditCommentAnnotationRequest, EditRevisionAnnotationRequest, NewCommentAnnotationRequest, NewRevisionAnnotationRequest, RevisionAnnotation, SectionAddAnnotation, SectionAddAnnotationRequest, SectionRemoveAnnotation, SectionRemoveAnnotationRequest

from app.database import get_db
from app.enums import AnnotationStatus, ContractActionType


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/contracts/{contract_id}/actions", response_model=ContractActionResponse, tags=["contract_actions"])
async def handle_contract_action(contract_id: UUID, request: ContractActionRequest, db: AsyncSession = Depends(get_db)) -> ContractActionResponse:
    """handle a contract action (e.g. comment, revision, section add/remove)"""

    # load the requested contract from the database and deserialize the corresponding pydantic model
    query = select(DBContract).where(DBContract.id == contract_id)
    result = await db.execute(query)
    dbcontract = result.scalar_one_or_none()
    if not dbcontract:
        raise HTTPException(status_code=404, detail="contract not found")
    contract = Contract.model_validate(dbcontract)

    # process the requested action updating the contract's section tree and/or annotations in-place
    match request.action:
        case ContractActionType.MAKE_COMMENT:
            result = handle_make_comment(contract, request.data)
        case ContractActionType.EDIT_COMMENT:
            result = handle_edit_comment(contract, request.data)
        case ContractActionType.MAKE_REVISION:
            result = handle_make_revision(contract, request.data)
        case ContractActionType.EDIT_REVISION:
            result = handle_edit_revision(contract, request.data)
        case ContractActionType.SECTION_ADD:
            result = handle_section_add(contract, request.data)
        case ContractActionType.SECTION_REMOVE:
            result = handle_section_remove(contract, request.data)
        case _:
            raise HTTPException(status_code=400, detail=f"invalid action type: {request.action}")

    # persist any updates made to the pydantic model back to the database, increment the contract version, and return the action result to the client
    dbcontract.section_tree = json.loads(contract.section_tree.model_dump_json())
    dbcontract.annotations = json.loads(contract.annotations.model_dump_json())
    dbcontract.version += 1
    await db.commit()
    return result


def handle_make_comment(contract: Contract, request: NewCommentAnnotationRequest) -> ContractActionResponse:
    """handle a request to make a new comment annotation"""

    # validate that the target node exists in the contract
    try:
        node = contract.section_tree.get_node_by_id(request.node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"node_id={request.node_id} not found")

    # validate that the comment text is not empty
    if not request.comment_text.strip():
        raise HTTPException(status_code=400, detail="comment text is required")

    # validate the offsets and anchor text in the request align with the current node content
    validate_anchor_text(node, request.offset_beg, request.offset_end, request.anchor_text)

    # create a new comment annotation and add it to the contract's annotations updating it in-place
    comment_annotation = CommentAnnotation(
        id=uuid4(),
        node_id=request.node_id,
        offset_beg=request.offset_beg,
        offset_end=request.offset_end,
        anchor_text=request.anchor_text,
        comment_text=request.comment_text,
        status=AnnotationStatus.PENDING,
        created_at=datetime.now(),
    )
    contract.annotations.comments.append(comment_annotation)
    new_contract_version = contract.version + 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.MAKE_COMMENT,
        action_id=comment_annotation.id,
        new_contract_version=new_contract_version,
        updated_annotations=ContractAnnotations(comments=[comment_annotation]),
    )
    return response


def handle_edit_comment(contract: Contract, request: EditCommentAnnotationRequest) -> ContractActionResponse:
    """handle a request to edit an existing comment annotation"""

    # validate that the request comment text is not empty
    if not request.comment_text.strip():
        raise HTTPException(status_code=400, detail="comment text is required")

    # find/validate the target comment annotation
    comment_annotation = None
    for comment in contract.annotations.comments:
        if comment.id == request.annotation_id:
            comment_annotation = comment
            break
    if not comment_annotation:
        raise HTTPException(status_code=404, detail=f"annotation_id={request.annotation_id} not found")

    # find/validate the annotation's target node
    try:
        node = contract.section_tree.get_node_by_id(comment_annotation.node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"node_id={comment_annotation.node_id} not found")

    # validate that the anchor text aligns with the current node content
    validate_anchor_text(node, comment_annotation.offset_beg, comment_annotation.offset_end, comment_annotation.anchor_text)

    # update the comment text in-place and increment the contract version
    comment_annotation.comment_text = request.comment_text
    new_contract_version = contract.version + 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.EDIT_COMMENT,
        action_id=comment_annotation.id,
        new_contract_version=new_contract_version,
        updated_annotations=ContractAnnotations(comments=[comment_annotation]),
    )
    return response


def handle_make_revision(contract: Contract, request: NewRevisionAnnotationRequest) -> ContractActionResponse:
    """handle a request to make a new revision annotation"""

    # validate that the target node exists in the contract
    try:
        node = contract.section_tree.get_node_by_id(request.node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"node_id={request.node_id} not found")

    # validate that the old/new text in the request are not empty
    if not request.old_text.strip() or not request.new_text.strip():
        raise HTTPException(status_code=400, detail="both old and new text are required")

    # validate that the old text matches the current content at the specified offsets
    validate_anchor_text(node, request.offset_beg, request.offset_end, request.old_text)

    # create a new revision annotation and add it to the contract's annotations
    revision_annotation = RevisionAnnotation(
        id=uuid4(),
        node_id=request.node_id,
        offset_beg=request.offset_beg,
        offset_end=request.offset_end,
        old_text=request.old_text,
        new_text=request.new_text,
        status=AnnotationStatus.PENDING,
        created_at=datetime.now(),
    )
    contract.annotations.revisions.append(revision_annotation)
    new_contract_version = contract.version + 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.MAKE_REVISION,
        action_id=revision_annotation.id,
        new_contract_version=new_contract_version,
        updated_annotations=ContractAnnotations(revisions=[revision_annotation]),
    )
    return response


def handle_edit_revision(contract: Contract, request: EditRevisionAnnotationRequest) -> ContractActionResponse:
    """handle a request to edit an existing revision annotation"""

    # validate that the updated revision text is not empty
    if not request.new_text.strip():
        raise HTTPException(status_code=400, detail="new text is required")

    # find/validate the target revision annotation
    revision_annotation = None
    for revision in contract.annotations.revisions:
        if revision.id == request.annotation_id:
            revision_annotation = revision
            break
    if not revision_annotation:
        raise HTTPException(status_code=404, detail=f"annotation_id={request.annotation_id} not found")

    # find/validate the annotation's target node
    try:
        node = contract.section_tree.get_node_by_id(revision_annotation.node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"node_id={revision_annotation.node_id} not found")

    # validate that the anchor text aligns with the current node content
    validate_anchor_text(node, revision_annotation.offset_beg, revision_annotation.offset_end, revision_annotation.old_text)

    # update the revision text in-place and increment the contract version
    revision_annotation.new_text = request.new_text
    new_contract_version = contract.version + 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.EDIT_REVISION,
        action_id=revision_annotation.id,
        new_contract_version=new_contract_version,
        updated_annotations=ContractAnnotations(revisions=[revision_annotation]),
    )
    return response


def handle_section_add(contract: Contract, request: SectionAddAnnotationRequest) -> ContractActionResponse:
    """handle a request to add a new section annotation"""

    # validate that the target parent node exists in the contract
    try:
        parent_node = contract.section_tree.get_node_by_id(request.target_parent_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"target_parent_id={request.target_parent_id} not found")

    # validate the insertion index of the new node
    if request.insertion_index < 0 or request.insertion_index > len(parent_node.children):
        raise HTTPException(status_code=400, detail=f"insertion_index={request.insertion_index} is out of range")

    # create the new section node annotation and add it to the contract's annotations
    new_section_annotation = SectionAddAnnotation(
        id=uuid4(),
        target_parent_id=request.target_parent_id,
        insertion_index=request.insertion_index,
        new_node=request.new_node,
        status=AnnotationStatus.PENDING,
        created_at=datetime.now(),
    )
    contract.annotations.section_adds.append(new_section_annotation)
    new_contract_version = contract.version + 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.SECTION_ADD,
        action_id=new_section_annotation.id,
        new_contract_version=new_contract_version,
        updated_annotations=ContractAnnotations(section_adds=[new_section_annotation]),
    )
    return response


def handle_section_remove(contract: Contract, request: SectionRemoveAnnotationRequest) -> ContractActionResponse:
    """handle a request to remove an existing section annotation"""

    # validate that the target node exists
    try:
        contract.section_tree.get_node_by_id(request.target_node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"target_node_id={request.target_node_id} not found")

    # create the section remove annotation and add it to the contract's annotations
    section_remove_annotation = SectionRemoveAnnotation(
        id=uuid4(),
        target_node_id=request.target_node_id,
        status=AnnotationStatus.PENDING,
        created_at=datetime.now(),
    )
    contract.annotations.section_removes.append(section_remove_annotation)
    new_contract_version = contract.version + 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.SECTION_REMOVE,
        action_id=section_remove_annotation.id,
        new_contract_version=new_contract_version,
        updated_annotations=ContractAnnotations(section_removes=[section_remove_annotation]),
    )
    return response


def validate_anchor_text(node: ContractSectionNode, offset_beg: int, offset_end: int, expected_anchor: str) -> None:
    """validate that the anchor text in the request aligns with the current node content"""

    try:
        actual_anchor = node.markdown[offset_beg:offset_end]
        if actual_anchor != expected_anchor:
            logger.error(f"anchor text mismatch! node_id={node.id} expected={expected_anchor} actual={actual_anchor}")
            raise HTTPException(status_code=400, detail=f"anchor text mismatch! node_id={node.id} expected='{expected_anchor}' actual='{actual_anchor}'")
    except IndexError:
        raise HTTPException(status_code=400, detail=f"offsets out of range! node_id={node.id} offset_beg={offset_beg} offset_end={offset_end}")
