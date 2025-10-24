import re
import json

from uuid import UUID
from typing import Optional
from agents import function_tool, RunContextWrapper


from app.enums import AnnotationStatus, AnnotationType, ContractSectionType
from app.utils.common import string_truncate
from app.common.schemas import ContractSectionNode

from app.features.contract_annotations.schemas import CommentAnnotation, NewCommentAnnotationRequest, NewRevisionAnnotationRequest, RevisionAnnotation, SectionAddAnnotation, SectionAddAnnotationRequest, SectionRemoveAnnotation, SectionRemoveAnnotationRequest
from app.features.contract_agent.agent import AgentContext
from app.features.contract_agent.schemas import AgentContractSectionPreview, AgentContractSection, AgentContractTextMatch, AgentCommentAnnotation, AgentRevisionAnnotation, AgentSectionAddAnnotation, AgentSectionRemoveAnnotation, AgentCommentAnnotationResponse, AgentRevisionAnnotationResponse, AgentAddSectionResponse, AgentRemoveSectionResponse
from app.features.contract_agent.services import flatten_section_tree, get_relevant_sections, persist_contract_changes
from app.features.contract_annotations.services import handle_make_comment, handle_make_revision, handle_section_add, handle_section_remove


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def list_contract_sections(
    wrapper: RunContextWrapper[AgentContext],
    parent_section_number: Optional[str] = None,
    max_depth: Optional[int] = None
) -> str:
    """
    Get a flat list of ordered contract section previews below an optional parent section (defaults to the root section to list the entire section tree)
    
    :param parent_section_number: an optional parent section number to use to filter the section tree (defaults to the root section)
    :param max_depth: the optional max depth of the section tree to list below the parent section (defaults to no maximum depth)
    :return: a list of section preview objects containing the section type, level, number, and text preview
    """

    if parent_section_number:
        node = wrapper.context.contract.section_tree.get_node_by_id(node_id=parent_section_number)
    else:
        node = wrapper.context.contract.section_tree

    flat_sections = flatten_section_tree(node=node, max_depth=max_depth)
    agent_section_previews = [
        AgentContractSectionPreview(
            type=section.type, 
            level=section.level, 
            section_number=section.number, 
            section_text_preview=string_truncate(string=section.markdown, max_tokens=50)
        ) for section in flat_sections
    ]
    agent_section_previews_json = json.dumps([json.loads(section.model_dump_json()) for section in agent_section_previews], indent=2)
    return agent_section_previews_json


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def get_contract_section(
    wrapper: RunContextWrapper[AgentContext], 
    section_number: str,
    include_children: bool = False,
    max_depth: Optional[int] = None
) -> str:
    """
    Get the full text of a contract section and optionally include child sections up to a specified max depth
    
    :param section_number: the contract section number
    :param include_children: whether to include child sections (defaults to False)
    :param max_depth: the max depth of child sections to include (defaults to no maximum depth)
    :return: a list of section text objects containing the section type, level, number, and full section text
    """

    node = wrapper.context.contract.section_tree.get_node_by_id(node_id=section_number)
    if include_children:
        flat_sections = flatten_section_tree(node=node, max_depth=max_depth)
    else:
        flat_sections = [node]

    agent_sections = [
        AgentContractSection(
            type=section.type,
            level=section.level,
            section_number=section.number,
            section_text=section.markdown
        ) for section in flat_sections
    ]
    agent_sections_json = json.dumps([json.loads(section.model_dump_json()) for section in agent_sections], indent=2)
    return agent_sections_json


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def search_contract_sections(wrapper: RunContextWrapper[AgentContext], search_phrase: str) -> str:
    """
    Search for relevant contract sections using a natural language search phrase
    
    :param search_phrase: the natural language search phrase to use to find relevant contract sections via embedding similarity search
    :return: a list of matching section objects containing the section type, level, number, and full section text
    :raises ValueError: if the provided search phrase is empty or invalid
    """

    relevant_sections = await get_relevant_sections(wrapper.context.db, wrapper.context.contract.id, search_phrase)
    agent_sections = [
        AgentContractSection(
            type=section.type,
            level=section.level,
            section_number=section.number,
            section_text=section.markdown
        ) for section in relevant_sections
    ]
    agent_sections_json = json.dumps([json.loads(section.model_dump_json()) for section in agent_sections], indent=2)
    return agent_sections_json


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def search_contract_lines(wrapper: RunContextWrapper[AgentContext], pattern: str) -> str:
    """
    Search for matching contract text lines using a regular expression pattern

    :param pattern: the regular expression pattern to match against contract text lines
    :return: a list of match objects containing the relevant section number and matching line text
    :raises ValueError: if the provided pattern is not a valid regular expression
    """
    
    flat_sections = flatten_section_tree(wrapper.context.contract.section_tree)
    compiled_pattern = re.compile(pattern, re.IGNORECASE)
    matches: list[AgentContractTextMatch] = []
    
    for section in flat_sections:
        section_lines = section.markdown.split('\n')
        for line in section_lines:
            if compiled_pattern.search(line):
                match = AgentContractTextMatch(section_number=section.number, match_line=line.strip())
                matches.append(match)
    
    matches_json = json.dumps([json.loads(match.model_dump_json()) for match in matches], indent=2)
    return matches_json


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def make_comment(wrapper: RunContextWrapper[AgentContext], section_number: str, anchor_text: str, comment_text: str) -> str:
    """
    Make a new comment anchored to a specific contract section and text span.

    Comments must be anchored to a single contract section and within-section consecutive text span. 
    The anchor text must exactly match the text as it appears in the retrieved contract section.
    Comments are displayed in the UI as highlights over the anchor text with the comment text displayed in a tooltip.
    Comments are stored in an annotations collection associated with the contract itself.

    :param section_number: the section number of the contract to which the comment applies
    :param anchor_text: the anchor text for the comment exactly as it appears in the retrieved contract section text
    :param comment_text: the new comment text
    :return: the newly created comment annotation object
    """

    # get/validate the relevant section node
    try:
        section_node = wrapper.context.contract.section_tree.get_node_by_id(node_id=section_number)
    except ValueError:
        raise ValueError(f"{section_number=} not found in the contract sections")

    # get/validate the offsets for the anchor text
    try:
        offset_beg = section_node.markdown.index(anchor_text)
        offset_end = offset_beg + len(anchor_text)
    except ValueError:
        raise ValueError(f"{anchor_text=} not found in the contract section text")

    # create the new comment annotation object
    request = NewCommentAnnotationRequest(
        node_id=section_number,
        offset_beg=offset_beg,
        offset_end=offset_end,
        anchor_text=anchor_text,
        comment_text=comment_text
    )
    try:
        handle_make_comment(contract=wrapper.context.contract, request=request)
        await persist_contract_changes(db=wrapper.context.db, contract=wrapper.context.contract)
        return AgentCommentAnnotationResponse(status="applied", section_number=section_number, anchor_text=anchor_text, comment_text=comment_text).model_dump_json(indent=2)
    except Exception as e:
        raise ValueError(f"failed to apply comment: {e}")


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def make_revision(wrapper: RunContextWrapper[AgentContext], section_number: str, old_text: str, new_text: str) -> str:
    """
    Make a new suggested revision anchored to a specific contract section and text span.

    Suggested revisions must be anchored to a single contract section and within-section consecutive text span. 
    The old text must exactly match the text as it appears in the retrieved contract section.
    Suggested revisions are displayed in the UI using strikethrough formatting for the old text and highlighting for the new text.
    Suggested revisions are stored in an annotations collection associated with the contract itself.

    :param section_number: the section number of the contract to which the revision applies
    :param old_text: the old text for the revision exactly as it appears in the retrieved contract section text
    :param new_text: the new text for the revision
    :return: the newly created suggested revision annotation object
    """

    # get/validate the relevant section node
    try:
        section_node = wrapper.context.contract.section_tree.get_node_by_id(node_id=section_number)
    except ValueError:
        raise ValueError(f"{section_number=} not found in the contract sections")

    # get/validate the offsets for the old text
    try:
        offset_beg = section_node.markdown.index(old_text)
        offset_end = offset_beg + len(old_text)
    except ValueError:
        raise ValueError(f"{old_text=} not found in the contract section text")

    # create the new revision annotation object
    request = NewRevisionAnnotationRequest(
        node_id=section_number,
        offset_beg=offset_beg,
        offset_end=offset_end,
        old_text=old_text,
        new_text=new_text
    )
    try:
        handle_make_revision(contract=wrapper.context.contract, request=request)
        await persist_contract_changes(db=wrapper.context.db, contract=wrapper.context.contract)
        return AgentRevisionAnnotationResponse(status="applied", section_number=section_number, old_text=old_text, new_text=new_text).model_dump_json(indent=2)
    except Exception as e:
        raise ValueError(f"failed to apply revision: {e}")


@function_tool
async def add_section(
    wrapper: RunContextWrapper[AgentContext], 
    parent_section_number: str,
    insertion_index: int,
    section_number: str,
    section_type: ContractSectionType,
    section_text: str
) -> str:
    """
    Add a new section to the contract tree at a specific child index below an existing parent section.

    :param parent_section_number: the number of the parent section to add the new section below
    :param insertion_index: the index of the new section in the parent section's children list
    :param section_number: the number of the new section which should conform to the existing section numbering scheme
    :param section_type: the type of the new section which must be a valid contract section type
    :param section_text: the text of the new section which must be a valid markdown string
    :return: the created section annotation object
    """

    try:
        parent_section_node = wrapper.context.contract.section_tree.get_node_by_id(node_id=parent_section_number)
    except ValueError:
        raise ValueError(f"{parent_section_number=} not found in the contract sections")

    new_node = ContractSectionNode(
        id=section_number,
        type=section_type,
        level=parent_section_node.level + 1,
        number=section_number,
        markdown=section_text
    )
    request = SectionAddAnnotationRequest(
        target_parent_id=parent_section_number,
        insertion_index=insertion_index,
        new_node=new_node
    )
    response = handle_section_add(contract=wrapper.context.contract, request=request)
    await persist_contract_changes(db=wrapper.context.db, contract=wrapper.context.contract)
    section = AgentContractSection(type=new_node.type, level=new_node.level, section_number=new_node.number, section_text=new_node.markdown)
    return AgentAddSectionResponse(status=response.status, section=section).model_dump_json(indent=2)


@function_tool
async def remove_section(wrapper: RunContextWrapper[AgentContext], section_number: str) -> str:
    """
    Remove an existing section from the contract tree.

    :param section_number: the number of the section to remove
    :return: the deleted section annotation object
    """

    request = SectionRemoveAnnotationRequest(node_id=section_number)
    response = handle_section_remove(contract=wrapper.context.contract, request=request)
    await persist_contract_changes(db=wrapper.context.db, contract=wrapper.context.contract)
    return AgentRemoveSectionResponse(status=response.status).model_dump_json(indent=2)


@function_tool
async def get_contract_annotations(wrapper: RunContextWrapper[AgentContext], annotation_type: Optional[AnnotationType] = None, section_number: Optional[str] = None) -> str:
    """
    Get unresolved contract annotations optionally filtered by annotation type and section number

    :param annotation_type: filter by annotation type (defaults to all annotation types)
    :param section_number: filter by section number (defaults to all contract sections)
    :return: a list of contract annotation objects
    """

    if not wrapper.context.contract.annotations:
        return json.dumps([], indent=2)
        
    match annotation_type:
        case AnnotationType.COMMENT:
            annotations = wrapper.context.contract.annotations.comments
            annotations = [AgentCommentAnnotation(id=annotation.id, section_number=annotation.node_id, anchor_text=annotation.anchor_text, comment_text=annotation.comment_text) for annotation in annotations if annotation.status == AnnotationStatus.PENDING]
        case AnnotationType.REVISION:
            annotations = wrapper.context.contract.annotations.revisions
            annotations = [AgentRevisionAnnotation(id=annotation.id, section_number=annotation.node_id, old_text=annotation.old_text, new_text=annotation.new_text) for annotation in annotations if annotation.status == AnnotationStatus.PENDING]
        case AnnotationType.SECTION_ADD:
            annotations = wrapper.context.contract.annotations.section_adds
            annotations = [AgentSectionAddAnnotation(id=annotation.id, target_parent_section_number=annotation.target_parent_id, insertion_index=annotation.insertion_index, section_number=annotation.new_node.number, section_type=annotation.new_node.type, section_text=annotation.new_node.markdown) for annotation in annotations if annotation.status == AnnotationStatus.PENDING]
        case AnnotationType.SECTION_REMOVE:
            annotations = wrapper.context.contract.annotations.section_removes
            annotations = [AgentSectionRemoveAnnotation(id=annotation.id, section_number=annotation.node_id) for annotation in annotations if annotation.status == AnnotationStatus.PENDING]
        case _:
            annotations = wrapper.context.contract.annotations
            comments = [AgentCommentAnnotation(id=annotation.id, section_number=annotation.node_id, anchor_text=annotation.anchor_text, comment_text=annotation.comment_text) for annotation in annotations.comments if annotation.status == AnnotationStatus.PENDING]
            revisions = [AgentRevisionAnnotation(id=annotation.id, section_number=annotation.node_id, old_text=annotation.old_text, new_text=annotation.new_text) for annotation in annotations.revisions if annotation.status == AnnotationStatus.PENDING]
            section_adds = [AgentSectionAddAnnotation(id=annotation.id, target_parent_section_number=annotation.target_parent_id, insertion_index=annotation.insertion_index, section_number=annotation.new_node.number, section_type=annotation.new_node.type, section_text=annotation.new_node.markdown) for annotation in annotations.section_adds if annotation.status == AnnotationStatus.PENDING]
            section_removes = [AgentSectionRemoveAnnotation(id=annotation.id, section_number=annotation.node_id) for annotation in annotations.section_removes if annotation.status == AnnotationStatus.PENDING]
            annotations = comments + revisions + section_adds + section_removes

    if section_number:
        annotations = [annotation for annotation in annotations if annotation.section_number == section_number]
        
    annotations_json = json.dumps([json.loads(annotation.model_dump_json()) for annotation in annotations], indent=2)
    return annotations_json


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def delete_contract_annotations(wrapper: RunContextWrapper[AgentContext], annotation_ids: list[str]) -> str:
    """
    Delete one or more contract annotations by ID.

    :param annotation_ids: a list of annotation IDs to delete
    :return: the list of deleted annotation IDs and not found annotation IDs
    """

    deleted_annotation_ids, not_found_annotation_ids = [], []
    for annotation_id_str in annotation_ids:
        try:
            annotation_id = UUID(annotation_id_str)
            annotation = wrapper.context.contract.annotations.get_annotation_by_id(annotation_id)            
            if isinstance(annotation, CommentAnnotation):
                wrapper.context.contract.annotations.comments.remove(annotation)
            elif isinstance(annotation, RevisionAnnotation):
                wrapper.context.contract.annotations.revisions.remove(annotation)
            elif isinstance(annotation, SectionAddAnnotation):
                wrapper.context.contract.annotations.section_adds.remove(annotation)
            elif isinstance(annotation, SectionRemoveAnnotation):
                wrapper.context.contract.annotations.section_removes.remove(annotation)
            deleted_annotation_ids.append(annotation.id)
        except ValueError:
            not_found_annotation_ids.append(annotation_id_str)

    if deleted_annotation_ids:
        wrapper.context.contract.version += 1
        await persist_contract_changes(db=wrapper.context.db, contract=wrapper.context.contract)
    
    result = {
        "deleted_annotation_ids": [str(id) for id in deleted_annotation_ids], 
        "not_found_annotation_ids": [str(id) for id in not_found_annotation_ids]
    }
    return json.dumps(result, indent=2)
