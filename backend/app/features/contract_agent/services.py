import json
import logging

from uuid import UUID
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import ContractSectionType
from app.models import Contract as DBContract, ContractSection as DBContractSection
from app.common.schemas import ContractSectionNode
from app.features.contract_annotations.schemas import Contract

from app.utils.embeddings import get_text_embedding


logger = logging.getLogger(__name__)


def flatten_section_tree(node: ContractSectionNode, max_depth: Optional[int] = None) -> list[ContractSectionNode]:
    """convert the section tree into a flat list of ordered section nodes"""

    flat_sections: list[ContractSectionNode] = []
    if node.type != ContractSectionType.ROOT:
        flat_sections.append(node)

    def dfs(node: ContractSectionNode, current_depth: int) -> None:
        """recursively add children in reading order"""
        
        for section in node.children:
            flat_sections.append(section)
            if max_depth is None or current_depth < max_depth - 1:
                dfs(section, current_depth + 1)

    dfs(node=node, current_depth=0)
    return flat_sections


async def get_relevant_sections(db: AsyncSession, contract_id: UUID, search_phrase: str) -> list[DBContractSection]:
    """fetch the most relevant contract sections given a natural language search phrase"""

    # convert the search phrase to an embedding vector
    search_phrase_embedding = await get_text_embedding(search_phrase)

    # fetch the most relevant additional contract sections based on the standalone search phrase
    statement = (
        select(DBContractSection)
        .where(
            DBContractSection.contract_id == contract_id,
            DBContractSection.level == 1,
            DBContractSection.embedding.is_not(None)
        )
        .order_by(DBContractSection.embedding.cosine_distance(search_phrase_embedding))
        .limit(10)
    )
    result = await db.execute(statement)
    relevant_sections = result.scalars().all()
    return relevant_sections


async def persist_contract_changes(db: AsyncSession, contract: Contract) -> None:
    """persist contract updates made by the agent to the database"""

    dbcontract = await db.get(DBContract, contract.id)
    dbcontract.section_tree = json.loads(contract.section_tree.model_dump_json())
    dbcontract.annotations = json.loads(contract.annotations.model_dump_json())
    dbcontract.version = contract.version
    await db.commit()
