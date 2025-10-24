import copy
import logging

from uuid import uuid4
from datetime import datetime, timezone

from fastapi import HTTPException

from app.features.contract_annotations.schemas import AnnotationResolutionRequest, AnnotationResolutionResponse, CommentAnnotation, Contract, ContractActionResponse, ContractAnnotation, ContractAnnotations, ContractSectionNode, EditCommentAnnotationRequest, EditRevisionAnnotationRequest, NewCommentAnnotationRequest, NewRevisionAnnotationRequest, RevisionAnnotation, SectionAddAnnotation, SectionAddAnnotationRequest, SectionRemoveAnnotation, SectionRemoveAnnotationRequest
from app.enums import AnnotationStatus, AnnotationType, ContractActionType, ContractAnnotationResolution


logger = logging.getLogger(__name__)


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
        author=request.author,
        status=AnnotationStatus.PENDING,
        created_at=datetime.now(tz=timezone.utc),
    )
    contract.annotations.comments.append(comment_annotation)
    contract.version += 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.MAKE_COMMENT,
        action_id=comment_annotation.id,
        new_contract_version=contract.version,
        updated_annotations=ContractAnnotations(comments=[comment_annotation]),
    )
    return response


def handle_edit_comment(contract: Contract, request: EditCommentAnnotationRequest) -> ContractActionResponse:
    """handle a request to edit an existing comment annotation"""

    # validate that the request comment text is not empty
    if not request.comment_text.strip():
        raise HTTPException(status_code=400, detail="comment text is required")

    # find/validate the target comment annotation
    try:
        comment_annotation = contract.annotations.get_annotation_by_id(request.annotation_id)
    except ValueError:
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
    contract.version += 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.EDIT_COMMENT,
        action_id=comment_annotation.id,
        new_contract_version=contract.version,
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
        author=request.author,
        status=AnnotationStatus.PENDING,
        created_at=datetime.now(tz=timezone.utc),
    )
    contract.annotations.revisions.append(revision_annotation)
    contract.version += 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.MAKE_REVISION,
        action_id=revision_annotation.id,
        new_contract_version=contract.version,
        updated_annotations=ContractAnnotations(revisions=[revision_annotation]),
    )
    return response


def handle_edit_revision(contract: Contract, request: EditRevisionAnnotationRequest) -> ContractActionResponse:
    """handle a request to edit an existing revision annotation"""

    # validate that the updated revision text is not empty
    if not request.new_text.strip():
        raise HTTPException(status_code=400, detail="new text is required")

    # find/validate the target revision annotation
    try:
        revision_annotation = contract.annotations.get_annotation_by_id(request.annotation_id)
    except ValueError:
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
    contract.version += 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.EDIT_REVISION,
        action_id=revision_annotation.id,
        new_contract_version=contract.version,
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
        author=request.author,
        status=AnnotationStatus.PENDING,
        created_at=datetime.now(tz=timezone.utc),
    )
    contract.annotations.section_adds.append(new_section_annotation)
    contract.version += 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.SECTION_ADD,
        action_id=new_section_annotation.id,
        new_contract_version=contract.version,
        updated_annotations=ContractAnnotations(section_adds=[new_section_annotation]),
    )
    return response


def handle_section_remove(contract: Contract, request: SectionRemoveAnnotationRequest) -> ContractActionResponse:
    """handle a request to remove an existing section annotation"""

    # validate that the target node exists
    try:
        contract.section_tree.get_node_by_id(request.node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"node_id={request.node_id} not found")

    # create the section remove annotation and add it to the contract's annotations
    section_remove_annotation = SectionRemoveAnnotation(
        id=uuid4(),
        node_id=request.node_id,
        author=request.author,
        status=AnnotationStatus.PENDING,
        created_at=datetime.now(tz=timezone.utc),
    )
    contract.annotations.section_removes.append(section_remove_annotation)
    contract.version += 1

    # build the response payload to return
    response = ContractActionResponse(
        status="applied",
        action=ContractActionType.SECTION_REMOVE,
        action_id=section_remove_annotation.id,
        new_contract_version=contract.version,
        updated_annotations=ContractAnnotations(section_removes=[section_remove_annotation]),
    )
    return response


def handle_resolve_comment(request: AnnotationResolutionRequest, contract: Contract, annotation: CommentAnnotation) -> AnnotationResolutionResponse:
    """handle a request to resolve a comment annotation"""

    # apply the comment resolution and increment the contract version
    annotation.status = AnnotationStatus.RESOLVED
    annotation.resolved_at = datetime.now(tz=timezone.utc)
    contract.version += 1

    # return the standardized resolution response
    response = AnnotationResolutionResponse(
        status="applied",
        annotation_id=annotation.id,
        annotation_type=AnnotationType.COMMENT,
        resolution=request.resolution,
        new_contract_version=contract.version,
        updated_annotations=ContractAnnotations(comments=[annotation]),
    )
    return response


def handle_resolve_revision(request: AnnotationResolutionRequest, contract: Contract, annotation: RevisionAnnotation) -> AnnotationResolutionResponse:
    """handle a request to resolve a revision annotation"""

    # locate the revision's target node
    try:
        node = contract.section_tree.get_node_by_id(annotation.node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"node_id={annotation.node_id} not found")

    # validate that the anchor text aligns with the current node content
    validate_anchor_text(node, annotation.offset_beg, annotation.offset_end, annotation.old_text)

    # create placeholders for the updated nodes and rebased annotations
    updated_nodes: list[ContractSectionNode] = []
    rebased_annotations: ContractAnnotations = ContractAnnotations()

    if request.resolution == ContractAnnotationResolution.ACCEPTED:
        # update the node's markdown text and mark the revision as accepted
        node.markdown = node.markdown[:annotation.offset_beg] + annotation.new_text + node.markdown[annotation.offset_end:]
        annotation.status = AnnotationStatus.ACCEPTED
        annotation.resolved_at = datetime.now(tz=timezone.utc)
        updated_nodes.append(node)
        # compute the text delta and rebase all affected annotations in-place
        delta = len(annotation.new_text) - len(annotation.old_text)
        if delta != 0:
            rebased_annotations = rebase_annotations(contract.annotations, annotation, delta)
    elif request.resolution == ContractAnnotationResolution.REJECTED:
        # mark the revision as rejected without updating the node
        annotation.status = AnnotationStatus.REJECTED
        annotation.resolved_at = datetime.now(tz=timezone.utc)
    else:
        # raise an error for invalid resolution types
        raise HTTPException(status_code=400, detail=f"invalid resolution: {request.resolution} for revision annotation_id={annotation.id}")

    # increment the contract version and return the standardized resolution response
    contract.version += 1
    response = AnnotationResolutionResponse(
        status="applied",
        annotation_id=annotation.id,
        annotation_type=AnnotationType.REVISION,
        resolution=request.resolution,
        new_contract_version=contract.version,
        updated_annotations=ContractAnnotations(revisions=[annotation]),
        updated_nodes=updated_nodes,
        rebased_annotations=rebased_annotations,
    )
    return response


def handle_resolve_section_add(request: AnnotationResolutionRequest, contract: Contract, annotation: SectionAddAnnotation) -> AnnotationResolutionResponse:
    """handle a request to resolve a section add annotation"""

    # locate the revision's target parent node
    try:
        parent_node = contract.section_tree.get_node_by_id(annotation.target_parent_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"target_parent_id={annotation.target_parent_id} not found")

    # validate that the insertion index is within the parent node's children
    if annotation.insertion_index < 0 or annotation.insertion_index > len(parent_node.children):
        raise HTTPException(status_code=400, detail=f"insertion_index={annotation.insertion_index} is out of range")

    # create placeholders for the updated nodes
    updated_nodes: list[ContractSectionNode] = []

    if request.resolution == ContractAnnotationResolution.ACCEPTED:
        # add the new node to the parent node's children and mark the section add as accepted
        new_node = copy.deepcopy(annotation.new_node)
        new_node.parent_id = parent_node.id
        parent_node.children.insert(annotation.insertion_index, new_node)
        annotation.status = AnnotationStatus.ACCEPTED
        annotation.resolved_at = datetime.now(tz=timezone.utc)
        updated_nodes.append(parent_node)
    elif request.resolution == ContractAnnotationResolution.REJECTED:
        # mark the section add as rejected without updating the parent node
        annotation.status = AnnotationStatus.REJECTED
        annotation.resolved_at = datetime.now(tz=timezone.utc)
    else:
        # raise an error for invalid resolution types
        raise HTTPException(status_code=400, detail=f"invalid resolution: {request.resolution} for section add annotation_id={annotation.id}")

    # increment the contract version and return the standardized resolution response
    contract.version += 1
    response = AnnotationResolutionResponse(
        status="applied",
        annotation_id=annotation.id,
        annotation_type=AnnotationType.SECTION_ADD,
        resolution=request.resolution,
        new_contract_version=contract.version,
        updated_annotations=ContractAnnotations(section_adds=[annotation]),
        updated_nodes=updated_nodes,
    )
    return response


def handle_resolve_section_remove(request: AnnotationResolutionRequest, contract: Contract, annotation: SectionRemoveAnnotation) -> AnnotationResolutionResponse:
    """handle a request to resolve a section remove annotation"""

    # locate the revision's target node and its parent node
    try:
        node = contract.section_tree.get_node_by_id(annotation.node_id)
        parent_node_id = node.parent_id
        if not parent_node_id:
            raise HTTPException(status_code=404, detail=f"node_id={annotation.node_id} is the root node and cannot be removed")
    except ValueError:
        raise HTTPException(status_code=404, detail=f"node_id={annotation.node_id} not found")

    # create placeholders for the updated nodes
    updated_nodes: list[ContractSectionNode] = []
    removed_annotations: ContractAnnotations = ContractAnnotations()

    if request.resolution == ContractAnnotationResolution.ACCEPTED:
        # remove the node from the parent node's children, remove its annotations, and mark the section remove as accepted
        parent_node = contract.section_tree.get_node_by_id(parent_node_id)
        if node in parent_node.children:
            parent_node.children.remove(node)
        else:
            raise HTTPException(status_code=400, detail=f"node_id={annotation.node_id} is not a child of parent_node_id={parent_node_id}")
        annotation.status = AnnotationStatus.ACCEPTED
        annotation.resolved_at = datetime.now(tz=timezone.utc)
        updated_nodes.append(parent_node)
        removed_annotations = remove_annotations(contract.annotations, annotation)
    elif request.resolution == ContractAnnotationResolution.REJECTED:
        # mark the section remove as rejected without updating the parent node
        annotation.status = AnnotationStatus.REJECTED
        annotation.resolved_at = datetime.now(tz=timezone.utc)
    else:
        # raise an error for invalid resolution types
        raise HTTPException(status_code=400, detail=f"invalid resolution: {request.resolution} for section remove annotation_id={annotation.id}")

    # increment the contract version and return the standardized resolution response
    contract.version += 1
    response = AnnotationResolutionResponse(
        status="applied",
        annotation_id=annotation.id,
        annotation_type=AnnotationType.SECTION_REMOVE,
        resolution=request.resolution,
        new_contract_version=contract.version,
        updated_annotations=ContractAnnotations(section_removes=[annotation]),
        updated_nodes=updated_nodes,
        rebased_annotations=removed_annotations,
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


def rebase_annotations(annotations: ContractAnnotations, edit_annotation: ContractAnnotation, delta: int) -> ContractAnnotations:
    """Shift annotation offsets forward/backward after a text insertion or deletion."""

    rebased_annotations = ContractAnnotations()
    node_annotations = [annotation for annotation in annotations.comments + annotations.revisions if annotation.node_id == edit_annotation.node_id and annotation.id != edit_annotation.id]

    for annotation in node_annotations:
        # annotations that end before the edit range are not affected
        if annotation.offset_end <= edit_annotation.offset_beg:
            continue
        # annotations that start after the edit range are shifted forwards/backwards based on the edit delta
        elif annotation.offset_beg >= edit_annotation.offset_end:
            annotation.offset_beg = max(0, annotation.offset_beg + delta)
            annotation.offset_end = max(0, annotation.offset_end + delta)
            if isinstance(annotation, CommentAnnotation):
                rebased_annotations.comments.append(annotation)
            elif isinstance(annotation, RevisionAnnotation):
                rebased_annotations.revisions.append(annotation)
        # annotations that overlap the edit range are marked as conflict and lose text anchors in the UI
        else:
            annotation.status = AnnotationStatus.CONFLICT
            annotation.resolved_at = datetime.now(tz=timezone.utc)
            if isinstance(annotation, CommentAnnotation):
                rebased_annotations.comments.append(annotation)
            elif isinstance(annotation, RevisionAnnotation):
                rebased_annotations.revisions.append(annotation)

    return rebased_annotations


def remove_annotations(annotations: ContractAnnotations, remove_annotation: SectionRemoveAnnotation) -> ContractAnnotations:
    """Remove annotations for a given node ID."""

    removed_annotations = ContractAnnotations()
    node_annotations = [annotation for annotation in annotations.comments + annotations.revisions if annotation.node_id == remove_annotation.node_id and annotation.id != remove_annotation.id]

    for annotation in node_annotations:
        annotation.status = AnnotationStatus.STALE
        annotation.resolved_at = datetime.now(tz=timezone.utc)
        if isinstance(annotation, CommentAnnotation):
            removed_annotations.comments.append(annotation)
        elif isinstance(annotation, RevisionAnnotation):
            removed_annotations.revisions.append(annotation)

    return removed_annotations
