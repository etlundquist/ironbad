"""
Generate Agent Outputs for Evaluation
- read evaluation inputs from agent_inputs.json
- lookup contract IDs from contract filenames
- make requests to POST /agent/runs/sync
- store the serialized run result output items in a new field called `assistant_output`
- save the evaluation examples (with the new `assistant_output` field) as agent_outputs.json
"""


import json
import copy
import httpx
import asyncio

from pathlib import Path

from app.common.schemas import Contract
from app.features.contract_agent.schemas import AgentRunRequest


BACKEND_BASE_URL = "http://localhost:8000"


async def get_contract_id_by_filename(filename: str) -> str | None:
    """Get the contract ID for a given contract filename"""

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(f"{BACKEND_BASE_URL}/contracts")
        response.raise_for_status()
        contracts = [Contract.model_validate(contract) for contract in response.json()]
        for contract in contracts:
            if contract.filename == filename:
                return contract.id
        return None


async def run_agent_sync(contract_id: str, user_input: str) -> dict:
    """make a synchronous agent run request to the API"""
    
    request = AgentRunRequest(contract_id=contract_id, content=user_input)
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(f"{BACKEND_BASE_URL}/agent/runs/sync", json=json.loads(request.model_dump_json()))
        response.raise_for_status()
        return response.json()


async def generate_agent_output(agent_input: dict) -> dict:
    """generate a corresponding agent output for a given agent input example"""

    # lookup the contract ID for the given contract filename
    contract_id = await get_contract_id_by_filename(agent_input["contract_filename"])
    if not contract_id:
        print(f"ContractID lookup failed for filename: {agent_input['contract_filename']}")
        return None
    
    # make the agent run request
    print(f"generating agent output for input: {agent_input['id']}")
    run_result = await run_agent_sync(contract_id, agent_input["user_input"])
    return run_result["output"]
        

async def main():
    """generate a corresponding agent output for each agent input example"""

    inputs_path = Path(__file__).parent / "agent_inputs.json"
    with open(inputs_path, "r") as f:
        agent_inputs = json.load(f)
        print(f"loaded {len(agent_inputs)} agent input examples")
    
    agent_outputs = copy.deepcopy(agent_inputs)
    agent_tasks = [generate_agent_output(agent_input) for agent_input in agent_inputs]
    agent_outputs = await asyncio.gather(*agent_tasks)

    for i, agent_output in enumerate(agent_outputs):
        agent_inputs[i]["assistant_output"] = agent_output

    outputs_path = Path(__file__).parent / "agent_outputs.json"
    with open(outputs_path, "w") as f:
        json.dump(agent_outputs, f, indent=2)


if __name__ == "__main__":
    asyncio.run(main())
