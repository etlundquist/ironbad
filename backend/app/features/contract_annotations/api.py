
import json
import logging

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.contract_annotations.schemas import AnnotationDeleteResponse, AnnotationResolutionRequest, AnnotationResolutionResponse, CommentAnnotation, Contract, ContractActionRequest, ContractActionResponse, ContractAnnotations, RevisionAnnotation, SectionAddAnnotation, SectionRemoveAnnotation
from app.enums import AnnotationStatus, AnnotationType, ContractActionType
from app.models import Contract as DBContract
from app.api.deps import get_db
from app.features.contract_annotations.services import (
    handle_make_comment, 
    handle_edit_comment, 
    handle_make_revision, 
    handle_edit_revision, 
    handle_section_add, 
    handle_section_remove, 
    handle_resolve_comment, 
    handle_resolve_revision, 
    handle_resolve_section_add, 
    handle_resolve_section_remove
)


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/contracts/{contract_id}/actions", response_model=ContractActionResponse, tags=["contract_annotations"])
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
    dbcontract.version = contract.version
    await db.commit()
    return result


@router.post("/contracts/{contract_id}/annotations/resolve", response_model=AnnotationResolutionResponse, tags=["contract_annotations"])
async def resolve_contract_annotation(contract_id: UUID, request: AnnotationResolutionRequest, db: AsyncSession = Depends(get_db)) -> AnnotationResolutionResponse:
    """resolve a contract annotation (e.g. comment, revision, section add/remove)"""

    # load the requested contract from the database and deserialize the corresponding pydantic model
    query = select(DBContract).where(DBContract.id == contract_id)
    result = await db.execute(query)
    dbcontract = result.scalar_one_or_none()
    if not dbcontract:
        raise HTTPException(status_code=404, detail="contract not found")
    contract = Contract.model_validate(dbcontract)

    # find/validate the target annotation
    try:
        annotation = contract.annotations.get_annotation_by_id(request.annotation_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"annotation_id={request.annotation_id} not found!")

    # ensure the annotation status is pending to avoid duplicate resolutions or resolving a conflicted annotation
    if annotation.status != AnnotationStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"annotation_id={request.annotation_id} status={annotation.status} cannot be resolved!")

    # process the requested resolution updating the contract's section tree and/or annotations in-place
    match request.annotation_type:
        case AnnotationType.COMMENT:
            result = handle_resolve_comment(request, contract, annotation)
        case AnnotationType.REVISION:
            result = handle_resolve_revision(request, contract, annotation)
        case AnnotationType.SECTION_ADD:
            result = handle_resolve_section_add(request, contract, annotation)
        case AnnotationType.SECTION_REMOVE:
            result = handle_resolve_section_remove(request, contract, annotation)
        case _:
            raise HTTPException(status_code=400, detail=f"invalid annotation type: {request.annotation_type}")

    # persist any updates made to the pydantic model back to the database, increment the contract version, and return the action result to the client
    dbcontract.section_tree = json.loads(contract.section_tree.model_dump_json())
    dbcontract.annotations = json.loads(contract.annotations.model_dump_json())
    dbcontract.version = contract.version
    await db.commit()
    return result


@router.delete("/contracts/{contract_id}/annotations/{annotation_id}", response_model=AnnotationDeleteResponse, tags=["contract_annotations"])
async def delete_contract_annotation(contract_id: UUID, annotation_id: UUID, db: AsyncSession = Depends(get_db)) -> AnnotationDeleteResponse:
    """delete a contract annotation (e.g. comment, revision, section add/remove)"""

    # load the requested contract from the database
    query = select(DBContract).where(DBContract.id == contract_id)
    result = await db.execute(query)
    dbcontract = result.scalar_one_or_none()
    if not dbcontract:
        raise HTTPException(status_code=404, detail="contract not found")
    contract = Contract.model_validate(dbcontract)

    # find/validate the target annotation
    try:
        annotation = contract.annotations.get_annotation_by_id(annotation_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"annotation_id={annotation_id} not found")

    # delete the annotation in-place and return the updated annotation for the response
    updated_annotations = ContractAnnotations()
    if isinstance(annotation, CommentAnnotation):
        contract.annotations.comments.remove(annotation)
        updated_annotations.comments.append(annotation)
    elif isinstance(annotation, RevisionAnnotation):
        contract.annotations.revisions.remove(annotation)
        updated_annotations.revisions.append(annotation)
    elif isinstance(annotation, SectionAddAnnotation):
        contract.annotations.section_adds.remove(annotation)
        updated_annotations.section_adds.append(annotation)
    elif isinstance(annotation, SectionRemoveAnnotation):
        contract.annotations.section_removes.remove(annotation)
        updated_annotations.section_removes.append(annotation)
    else:
        raise HTTPException(status_code=400, detail=f"invalid annotation type: {type(annotation)}")

    # increment the contract version and commit the annotation deletion to the database
    contract.version += 1
    dbcontract.annotations = json.loads(contract.annotations.model_dump_json())
    dbcontract.version = contract.version
    await db.commit()

    # return the standardized annotation deletion response
    response = AnnotationDeleteResponse(
        status="applied",
        annotation_id=annotation_id,
        new_contract_version=contract.version,
        updated_annotations=updated_annotations,
    )
    return response

