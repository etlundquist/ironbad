import json

from agents import Agent, RunContextWrapper
from agents.model_settings import Reasoning, ModelSettings
from sqlalchemy import select

from app.core.config import settings
from app.models import StandardClause as DBStandardClause
from app.features.contract_agent.schemas import AgentContext, AgentContractSectionPreview, AgentStandardClausePreview
from app.features.contract_agent.services import flatten_section_tree
from app.utils.common import string_truncate

from app.features.contract_agent.tools import (
    list_contract_sections, 
    get_contract_section, 
    search_contract_sections, 
    search_contract_lines, 
    list_precedent_sections,
    get_precedent_section,
    search_precedent_sections,
    search_precedent_lines,
    get_contract_annotations, 
    delete_contract_annotations, 
    make_comment, 
    make_revision, 
    add_section, 
    remove_section,
    get_standard_clause,
    todo_write
)
from app.prompts import PROMPT_REDLINE_AGENT


async def resolve_agent_instructions(wrapper: RunContextWrapper[AgentContext], agent: Agent[AgentContext]) -> str:
    """resolve the dynamic agent instructions by injecting contract-specific high-level context"""

    # retrieve the contract and request from the context to build the instructions dynamically
    contract = wrapper.context.contract 

    # retrieve the contract summary and top-level sections
    contract_summary = contract.meta.summary
    top_level_sections = flatten_section_tree(contract.section_tree, max_depth=1)
    top_level_sections = [
        AgentContractSectionPreview(
            type=section.type, 
            level=section.level, 
            section_number=section.number, 
            section_text_preview=string_truncate(string=section.markdown, max_tokens=50)
        ) for section in top_level_sections
    ]
    top_level_sections = json.dumps([json.loads(section.model_dump_json()) for section in top_level_sections], indent=2)

    # retrieve the standard clause previews (id, name, description only)
    result = await wrapper.context.db.execute(select(DBStandardClause).order_by(DBStandardClause.name))
    db_standard_clauses = result.scalars().all()
    standard_clauses = [
        AgentStandardClausePreview(
            id=clause.name, 
            name=clause.display_name, 
            description=clause.description
        ) 
        for clause in db_standard_clauses
    ]
    standard_clauses = json.dumps([json.loads(clause.model_dump_json()) for clause in standard_clauses], indent=2)  

    # resolve the agent instructions by injecting the contract-specific summary, top-level section previews, and standard clause list
    agent_instructions = PROMPT_REDLINE_AGENT.format(contract_summary=contract_summary, top_level_sections=top_level_sections, standard_clauses=standard_clauses)
    return agent_instructions


model_settings = ModelSettings(reasoning=Reasoning(effort="medium", summary="detailed"), verbosity="medium", store=True)
# TODO: switch to 'concise' reasoning summary once the SDK bug is fixed (https://github.com/openai/codex/issues/2376)

agent = Agent[AgentContext](
    name="Contract Redline Agent",
    model=settings.openai_agent_model,
    instructions=resolve_agent_instructions,
    model_settings=model_settings,
    tools=[
        todo_write,
        list_contract_sections, 
        get_contract_section, 
        search_contract_sections, 
        search_contract_lines,
        list_precedent_sections,
        get_precedent_section,
        search_precedent_sections,
        search_precedent_lines,
        get_contract_annotations, 
        delete_contract_annotations, 
        make_comment, 
        make_revision, 
        add_section,
        remove_section,
        get_standard_clause
    ]
)
