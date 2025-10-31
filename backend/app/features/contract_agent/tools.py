import re
import json
import logging

from uuid import UUID
from typing import Optional
from agents import Agent, RunContextWrapper, function_tool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Contract as DBContract, StandardClause as DBStandardClause
from app.enums import AnnotationStatus, AnnotationType, ContractSectionType, AnnotationAuthor
from app.common.schemas import ContractSectionNode
from app.utils.common import string_truncate

from app.features.contract_annotations.schemas import AnnotatedContract, CommentAnnotation, NewCommentAnnotationRequest, NewRevisionAnnotationRequest, RevisionAnnotation, SectionAddAnnotation, SectionAddAnnotationRequest, SectionRemoveAnnotation, SectionRemoveAnnotationRequest
from app.features.contract_agent.agent import AgentContext
from app.features.contract_agent.schemas import AgentContractSectionPreview, AgentContractSection, AgentContractTextMatch, AgentCommentAnnotation, AgentDeleteAnnotationsResponse, AgentRevisionAnnotation, AgentSectionAddAnnotation, AgentSectionRemoveAnnotation, AgentCommentAnnotationResponse, AgentRevisionAnnotationResponse, AgentAddSectionResponse, AgentRemoveSectionResponse, AgentStandardClause, AgentStandardClausePreview, AgentStandardClauseRule, AgentTodoItem
from app.features.contract_agent.services import flatten_section_tree, get_relevant_sections, persist_contract_changes
from app.features.contract_annotations.services import handle_make_comment, handle_make_revision, handle_section_add, handle_section_remove


logger = logging.getLogger(__name__)


# private helper functions that will work on any contract object 
# --------------------------------------------------------------

def _list_sections(
    contract: AnnotatedContract, 
    parent_section_number: Optional[str] = None, 
    max_depth: Optional[int] = None
) -> list[AgentContractSectionPreview]:
    """list contract sections below a parent section with a text preview"""
    
    if parent_section_number:
        node = contract.section_tree.get_node_by_id(node_id=parent_section_number)
    else:
        node = contract.section_tree

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


def _get_section(
    contract: AnnotatedContract, 
    section_number: str, 
    include_children: bool = False, 
    max_depth: Optional[int] = None
) -> str:
    """get the full text of a contract section and optionally include child sections up to a specified max depth"""

    node = contract.section_tree.get_node_by_id(node_id=section_number)
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


async def _search_sections(db: AsyncSession, contract: AnnotatedContract, search_phrase: str) -> str:
    """Core implementation for searching sections in any contract"""

    relevant_sections = await get_relevant_sections(db, contract.id, search_phrase)
    agent_sections = [
        AgentContractSection(
            type=section.type,
            level=section.level,
            section_number=section.number,
            section_text=section.markdown
        ) for section in relevant_sections
    ]
    return json.dumps([json.loads(section.model_dump_json()) for section in agent_sections], indent=2)


def _search_lines(contract: AnnotatedContract, pattern: str) -> str:
    """Core implementation for regex searching in any contract"""

    flat_sections = flatten_section_tree(contract.section_tree)
    compiled_pattern = re.compile(pattern, re.IGNORECASE)
    matches: list[AgentContractTextMatch] = []
    
    for section in flat_sections:
        section_lines = section.markdown.split('\n')
        for line in section_lines:
            if compiled_pattern.search(line):
                match = AgentContractTextMatch(section_number=section.number, match_line=line.strip())
                matches.append(match)
    
    return json.dumps([json.loads(match.model_dump_json()) for match in matches], indent=2)


async def _get_precedent_document(db: AsyncSession, filename: str) -> AnnotatedContract:
    """Load a precedent document by filename"""

    query = select(DBContract).where(DBContract.filename == filename)
    result = await db.execute(query)
    db_document = result.scalar_one_or_none()
    if not db_document:
        raise ValueError(f"precedent document '{filename}' not found")

    precedent_document = AnnotatedContract.model_validate(db_document)
    return precedent_document


# main contract search/retrieval tools
# ------------------------------------

@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def list_contract_sections(
    wrapper: RunContextWrapper[AgentContext],
    parent_section_number: Optional[str] = None,
    max_depth: Optional[int] = None
) -> str:
    """
    Get a flattened list of ordered contract section previews in natural reading order.
    You may filter the results by providing a parent section number to output only that parent section and its corresponding child sections.
    You may limit the results by specifying a max depth to limit the depth of included child sections.
    Use this tool to get an overview of the contract structure/contents to inform subsequent targeted section searches and/or retrievals.

    :param parent_section_number: an optional parent section number to limit the output to only that parent section and its corresponding child sections (defaults to the root section if not provided)
    :param max_depth: an optional max depth of child sections to include (defaults to no maximum depth to output all child sections under the parent section)
    :return: a flattened list of ordered section preview objects containing section metadata (type, level, number) and a short preview of the section text
    """

    contract = wrapper.context.contract
    return _list_sections(contract=contract, parent_section_number=parent_section_number, max_depth=max_depth)


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def get_contract_section(
    wrapper: RunContextWrapper[AgentContext], 
    section_number: str,
    include_children: bool = True,
    max_depth: Optional[int] = None
) -> str:
    """
    Get the full text of a contract section including its child sections (sub-sections in the original contract).
    You may include child sections to get the full text of sub-sections nested under the specified contract section.
    You may limit the results by specifying a max depth to limit the depth of child sections included in the results.
    Use this tool to retrieve the full text of a specific contract section including all of its sub-sections.

    :param section_number: the section number to retrieve
    :param include_children: whether to include sub-sections (defaults to True)
    :param max_depth: an optional max depth of child sections to include (defaults to no maximum depth)
    :return: a flattened list of ordered section objects containing section metadata (type, level, number) and the full section text
    """

    contract = wrapper.context.contract
    return _get_section(contract=contract, section_number=section_number, include_children=include_children, max_depth=max_depth)


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def search_contract_sections(
    wrapper: RunContextWrapper[AgentContext], 
    search_phrase: str
) -> str:
    """
    Search for relevant contract sections using a natural language search phrase.
    The search is performed using embedding similarity to retrieve the most similar contract sections to the search phrase.
    The search phrase should contain concepts, terms, and/or language relevant to the user's conceptual request.
    The search phrase should be in conversational format and not limited to single words, prefixes, or suffixes.
    Use this tool to search for relevant contract sections based on a conceptual request or question.

    :param search_phrase: natural language search phrase to match against contract sections via embedding similarity search
    :return: a prettified JSON array of relevant contract sections ordered by similarity to the search phrase
    """

    contract = wrapper.context.contract
    return await _search_sections(db=wrapper.context.db, contract=contract, search_phrase=search_phrase)


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def search_contract_lines(wrapper: RunContextWrapper[AgentContext], pattern: str) -> str:
    """
    Search for matching contract lines using a regular expression pattern.
    The pattern will be matched against each line of the contract text to find all matching lines. Matching is case-insensitive.
    The pattern should be a valid regular expression containing keywords and/or exact terms.
    Use this tool to find all occurrences of specific keywords or terms in the contract text.

    :param pattern: regular expression pattern to match against contract text lines
    :return: a prettified JSON array of all matching lines containing the section number and line text for each match
    """
    
    contract = wrapper.context.contract
    return _search_lines(contract=contract, pattern=pattern)

# precedent document search/retrieval tools
# -----------------------------------------

def precedent_tools_enabled(wrapper: RunContextWrapper[AgentContext], agent: Agent[AgentContext]) -> bool:
    """dynamically enable/disable precedent document tools based on whether the request includes a precedent document attachment"""

    request = wrapper.context.request
    if not request.attachments:
        return False
    
    for attachment in request.attachments:
        if attachment.kind == "pinned_precedent_document":
            return True
    
    return False


@function_tool(docstring_style="sphinx", use_docstring_info=True, is_enabled=precedent_tools_enabled)
async def list_precedent_sections(
    wrapper: RunContextWrapper[AgentContext],
    filename: str,
    parent_section_number: Optional[str] = None,
    max_depth: Optional[int] = None
) -> str:
    """
    Get a flattened list of ordered section previews from a precedent document in natural reading order.
    You may filter the results by providing a parent section number to output only that parent section and its corresponding child sections.
    You may limit the results by specifying a max depth to limit the depth of included child sections.
    Use this tool to get an overview of the precedent document structure/contents to inform subsequent targeted section searches and/or retrievals.
    
    :param filename: the filename of the precedent document to search
    :param parent_section_number: an optional parent section number to limit the output to only that parent section and its corresponding child sections (defaults to the root section if not provided)
    :param max_depth: an optional max depth of child sections to include (defaults to no maximum depth to output all child sections under the parent section)
    :return: a flattened list of ordered section preview objects containing section metadata (type, level, number) and a short preview of the section text
    """

    document = await _get_precedent_document(wrapper.context.db, filename)
    return _list_sections(contract=document, parent_section_number=parent_section_number, max_depth=max_depth)


@function_tool(docstring_style="sphinx", use_docstring_info=True, is_enabled=precedent_tools_enabled)
async def get_precedent_section(
    wrapper: RunContextWrapper[AgentContext],
    filename: str,
    section_number: str,
    include_children: bool = True,
    max_depth: Optional[int] = None
) -> str:
    """
    Get the full text of a section from a precedent document including its child sections (sub-sections in the original document).
    You may include child sections to get the full text of sub-sections nested under the specified section.
    You may limit the results by specifying a max depth to limit the depth of child sections included in the results.
    Use this tool to retrieve the full text of a specific section from a precedent document including all of its sub-sections.
    
    :param filename: the filename of the precedent document to search
    :param section_number: the section number to retrieve
    :param include_children: whether to include sub-sections (defaults to True)
    :param max_depth: an optional max depth of child sections to include (defaults to no maximum depth)
    :return: a flattened list of ordered section objects containing section metadata (type, level, number) and the full section text
    """

    document = await _get_precedent_document(wrapper.context.db, filename)
    return _get_section(contract=document, section_number=section_number, include_children=include_children, max_depth=max_depth)


@function_tool(docstring_style="sphinx", use_docstring_info=True, is_enabled=precedent_tools_enabled)
async def search_precedent_sections(
    wrapper: RunContextWrapper[AgentContext],
    filename: str,
    search_phrase: str
) -> str:
    """
    Search for relevant sections in a precedent document using a natural language search phrase.
    The search is performed using embedding similarity to retrieve the most similar sections to the search phrase.
    The search phrase should contain concepts, terms, and/or language relevant to the user's conceptual request.
    The search phrase should be in conversational format and not limited to single words, prefixes, or suffixes.
    Use this tool to search for relevant sections in a precedent document based on a conceptual request or question.
    
    :param filename: the filename of the precedent document to search
    :param search_phrase: natural language search phrase to match against precedent document sections via embedding similarity search
    :return: a prettified JSON array of relevant sections ordered by similarity to the search phrase
    """

    document = await _get_precedent_document(wrapper.context.db, filename)
    return await _search_sections(db=wrapper.context.db, contract=document, search_phrase=search_phrase)


@function_tool(docstring_style="sphinx", use_docstring_info=True, is_enabled=precedent_tools_enabled)
async def search_precedent_lines(
    wrapper: RunContextWrapper[AgentContext],
    filename: str,
    pattern: str
) -> str:
    """
    Search for matching lines in a precedent document using a regular expression pattern.
    The pattern will be matched against each line of the precedent document text to find all matching lines. Matching is case-insensitive.
    The pattern should be a valid regular expression containing keywords and/or exact terms.
    Use this tool to find all occurrences of specific keywords or terms in the precedent document text.
    
    :param filename: the filename of the precedent document to search
    :param pattern: regular expression pattern to match against precedent document text lines
    :return: a prettified JSON array of all matching lines containing the section number and line text for each match
    """

    document = await _get_precedent_document(wrapper.context.db, filename)
    return _search_lines(contract=document, pattern=pattern)

# contract annotation tools
# -------------------------

@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def get_contract_annotations(wrapper: RunContextWrapper[AgentContext], annotation_type: Optional[AnnotationType] = None, section_number: Optional[str] = None) -> str:
    """
    Get pending contract annotations optionally filtered by annotation type and section number.
    You may filter the results by including a specific annotation type or section number.
    Use this tool to review the current list of pending annotations before making new annotations or deleting existing annotations.

    :param annotation_type: an optional annotation type to filter the results by (defaults to all annotation types)
    :param section_number: an optional section number to filter the results by (defaults to all contract sections)
    :return: a list of pending contract annotations with the annotation type and relevant section/text anchor information
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
async def make_comment(
    wrapper: RunContextWrapper[AgentContext], 
    section_number: str, 
    anchor_text: str,
    comment_text: str
) -> str:
    """
    Make a new comment anchored to a specific contract section and consecutive text span.
    The comment anchor text must be an exact, case-sensitive substring of the retrieved contract section text.
    Use this tool to attach feedback to specific contract text spans for human review, including risks, issues, concerns, questions, clarifications, etc.

    :param section_number: the section number to which the comment applies
    :param anchor_text: the anchor text for the comment (exact, case-sensitive substring of the retrieved section text)
    :param comment_text: the new comment text that references the anchor text
    :return: the newly created comment annotation object to be reviewed by the user in the application UI
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
        comment_text=comment_text,
        author=AnnotationAuthor.AGENT
    )
    try:
        handle_make_comment(contract=wrapper.context.contract, request=request)
        await persist_contract_changes(db=wrapper.context.db, contract=wrapper.context.contract)
        return AgentCommentAnnotationResponse(status="success", section_number=section_number, anchor_text=anchor_text, comment_text=comment_text).model_dump_json(indent=2)
    except Exception as e:
        raise ValueError(f"failed to apply comment: {e}")


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def make_revision(
    wrapper: RunContextWrapper[AgentContext], 
    section_number: str, 
    old_text: str, 
    new_text: str
) -> str:
    """
    Make a new suggested revision anchored to a specific contract section and consecutive text span.
    The old text must be an exact, case-sensitive substring of the retrieved contract section text.
    Use this tool to edit specific contract text spans to add/remove/modify terms and conditions based on the user's request.

    :param section_number: the section number to which the revision applies
    :param old_text: the old text to be replaced (exact, case-sensitive substring of the retrieved section text)
    :param new_text: the new text to be inserted in place of the old text
    :return: the newly created suggested revision annotation object to be reviewed by the user in the application UI
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
        new_text=new_text,
        author=AnnotationAuthor.AGENT
    )
    try:
        handle_make_revision(contract=wrapper.context.contract, request=request)
        await persist_contract_changes(db=wrapper.context.db, contract=wrapper.context.contract)
        return AgentRevisionAnnotationResponse(status="success", section_number=section_number, old_text=old_text, new_text=new_text).model_dump_json(indent=2)
    except Exception as e:
        raise ValueError(f"failed to apply revision: {e}")


@function_tool(docstring_style="sphinx", use_docstring_info=True)
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
    You may add a new section below an existing parent section by providing the parent section number and insertion index.
    Use this tool to add an entirely new clause or sub-section to the contract, as opposed to revising an existing section.

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
        new_node=new_node,
        author=AnnotationAuthor.AGENT
    )
    response = handle_section_add(contract=wrapper.context.contract, request=request)
    await persist_contract_changes(db=wrapper.context.db, contract=wrapper.context.contract)
    section = AgentContractSection(type=new_node.type, level=new_node.level, section_number=new_node.number, section_text=new_node.markdown)
    status = "success" if response.status == "applied" else "failure"
    return AgentAddSectionResponse(status=status, section=section).model_dump_json(indent=2)


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def remove_section(
    wrapper: RunContextWrapper[AgentContext], 
    section_number: str
) -> str:
    """
    Remove an existing section from the contract tree.
    You may remove an existing section from the contract by providing the section number.
    Use this tool to remove an entire clause or sub-section from the contract, as opposed to revising it.

    :param section_number: the number of the section to remove
    :return: the deleted section annotation object
    """

    request = SectionRemoveAnnotationRequest(node_id=section_number, author=AnnotationAuthor.AGENT)
    response = handle_section_remove(contract=wrapper.context.contract, request=request)
    await persist_contract_changes(db=wrapper.context.db, contract=wrapper.context.contract)
    status = "success" if response.status == "applied" else "failure"
    return AgentRemoveSectionResponse(status=status).model_dump_json(indent=2)


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def delete_contract_annotations(wrapper: RunContextWrapper[AgentContext], annotation_ids: list[str]) -> str:
    """
    Delete one or more pending contract annotations by ID.
    You may delete annotations that are no longer needed or relevant based on the user's request.
    You may delete existing annotations to replace them with new annotations better aligned with the user's request.

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
    
    result = AgentDeleteAnnotationsResponse(
        status="success", 
        deleted_annotation_ids=[str(id) for id in deleted_annotation_ids], 
        not_found_annotation_ids=[str(id) for id in not_found_annotation_ids]
    )
    return result.model_dump_json(indent=2)


# standard clause/rules tools
# ---------------------------

@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def list_standard_clauses(wrapper: RunContextWrapper[AgentContext]) -> str:
    """
    List the set of standard clauses from the organization's standard clause library.
    Use this tool to get an overview of the organization's standard clauses to inform subsequent targeted standard clause retrievals.

    :return: a list of standard clause preview objects containing the clause ID, name, and description
    """

    result = await wrapper.context.db.execute(select(DBStandardClause).order_by(DBStandardClause.name))
    db_standard_clauses = result.scalars().all()
    standard_clauses = [AgentStandardClausePreview(id=clause.name, name=clause.display_name, description=clause.description) for clause in db_standard_clauses]
    return json.dumps([json.loads(clause.model_dump_json()) for clause in standard_clauses], indent=2)


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def get_standard_clause(wrapper: RunContextWrapper[AgentContext], clause_id: str) -> str:
    """
    Retrieve the full pre-approved standard clause text and associated policy rules for a specific standard clause.
    Use this tool to retrieve a specific standard clause including the pre-approved clause text and associated policy rules.

    :param clause_id: the ID of the standard clause to retrieve
    :return: the standard clause object containing the clause ID, name, description, pre-approved clause text, and list of associated policy rules
    """

    result = await wrapper.context.db.execute(select(DBStandardClause).where(DBStandardClause.name == clause_id).options(selectinload(DBStandardClause.rules)))
    db_standard_clause = result.scalar_one_or_none()
    if not db_standard_clause:
        raise ValueError(f"{clause_id=} not found in the standard clause library")

    standard_clause_rules = [AgentStandardClauseRule(severity=rule.severity.value, text=rule.text) for rule in db_standard_clause.rules]
    standard_clause = AgentStandardClause(id=db_standard_clause.name, name=db_standard_clause.display_name, description=db_standard_clause.description, standard_text=db_standard_clause.standard_text, rules=standard_clause_rules)
    return json.dumps(json.loads(standard_clause.model_dump_json()), indent=2)

# todo list tool
# ---------------

@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def todo_write(
    wrapper: RunContextWrapper[AgentContext],
    merge: bool,
    todos: list[AgentTodoItem]
) -> str:
    """
    Create, update, or delete todo items to manage and track progress on complex multi-step tasks.
    Use this tool proactively for complex tasks requiring 3+ distinct steps to organize work and demonstrate thoroughness.
    Each todo item must include: id (unique identifier), content (task description), and status (pending/in_progress/completed/cancelled).
    
    When to use:
    - complex multi-step tasks (3+ distinct steps)
    - non-trivial tasks requiring careful planning
    - after receiving new instructions (use merge=False to create new todos)
    - after completing tasks (use merge=True to mark complete and add follow-ups)
    - when starting new tasks (mark as in_progress, ideally only one at a time)
    
    When NOT to use:
    - single, straightforward tasks
    - trivial tasks completable in < 3 steps
    - purely informational requests
    
    Task Management Guidelines:
    - update status in real-time as you work
    - mark complete IMMEDIATELY after finishing
    - only ONE task in_progress at a time
    - complete current tasks before starting new ones
    
    :param merge: if True, merge/update existing todos by id; if False, replace all todos with the new list
    :param todos: array of todo items with id, content, and status fields
    :return: the updated todo list in JSON format
    """
    
    if len(todos) < 2:
        raise ValueError("Todo list must contain at least 2 items for complex tasks")
    
    # Convert input items to internal AgentTodoItem format
    new_todos = [AgentTodoItem(id=todo.id, content=todo.content, status=todo.status) for todo in todos]
    
    if merge:
        existing_todos_dict = {todo.id: todo for todo in wrapper.context.todos}
        for new_todo in new_todos:
            existing_todos_dict[new_todo.id] = new_todo
        wrapper.context.todos = list(existing_todos_dict.values())
    else:
        wrapper.context.todos = new_todos
    
    return json.dumps([json.loads(todo.model_dump_json()) for todo in wrapper.context.todos], indent=2)
    