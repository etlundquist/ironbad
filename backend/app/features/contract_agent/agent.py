from agents import Agent
from agents.model_settings import Reasoning, ModelSettings

from app.core.config import settings
from app.features.contract_agent.schemas import AgentContext

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
    resolve_agent_instructions
)


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
        get_contract_annotations, 
        delete_contract_annotations, 
        make_comment, 
        make_revision, 
        add_section,
        remove_section
    ]
)
