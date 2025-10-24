from fastapi import APIRouter

from app.api.system import router as system_router
from app.features.notifications.api import router as notifications_router
from app.features.workflows.api import router as workflows_router

from app.features.contract.api import router as contract_router
from app.features.contract_sections.api import router as contract_sections_router
from app.features.contract_clauses.api import router as contract_clauses_router
from app.features.contract_issues.api import router as contract_issues_router

from app.features.standard_clauses.api import router as standard_clauses_router
from app.features.standard_clause_rules.api import router as standard_clause_rules_router

from app.features.contract_annotations.api import router as contract_annotations_router
from app.features.contract_chat.api import router as contract_chat_router
from app.features.contract_agent.api import router as contract_agent_router


router = APIRouter()
router.include_router(system_router)
router.include_router(contract_router)
router.include_router(workflows_router)
router.include_router(standard_clauses_router)
router.include_router(standard_clause_rules_router)
router.include_router(contract_clauses_router)
router.include_router(contract_sections_router)
router.include_router(contract_chat_router)
router.include_router(contract_issues_router)
router.include_router(contract_annotations_router)
router.include_router(notifications_router)
router.include_router(contract_agent_router)
