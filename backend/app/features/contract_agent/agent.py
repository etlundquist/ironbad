import json

from agents import Agent, RunContextWrapper
from agents.model_settings import Reasoning, ModelSettings

from app.core.config import settings
from app.features.contract_agent.schemas import AgentContext, AgentContractSectionPreview
from app.features.contract_agent.services import flatten_section_tree
from app.utils.common import string_truncate

from app.features.contract_agent.tools import (
    list_contract_sections, 
    get_contract_section, 
    search_contract_sections, 
    search_contract_lines, 
    get_contract_annotations, 
    delete_contract_annotations, 
    make_comment, 
    make_revision, 
    add_section, 
    remove_section,
    list_precedent_sections,
    get_precedent_section,
    search_precedent_sections,
    search_precedent_lines,
    list_standard_clauses,
    get_standard_clause
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

    # resolve the agent instructions by injecting the contract-specific summary and top-level section previews
    agent_instructions = PROMPT_REDLINE_AGENT.format(contract_summary=contract_summary, top_level_sections=top_level_sections)
    return agent_instructions


model_settings = ModelSettings(reasoning=Reasoning(effort="medium", summary="detailed"), verbosity="medium", store=True)
# TODO: switch to 'concise' reasoning summary once the SDK bug is fixed (https://github.com/openai/codex/issues/2376)

agent = Agent[AgentContext](
    name="Contract Redline Agent",
    model=settings.openai_agent_model,
    instructions=resolve_agent_instructions,
    model_settings=model_settings,
    tools=[
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
        list_standard_clauses,
        get_standard_clause
    ]
)
