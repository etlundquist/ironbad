import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_extensions, create_tables, add_generated_columns, load_sample_data
from app.routers.index import router as index_router
from app.routers.contracts import router as contracts_router
from app.routers.ingestion import router as ingestion_router
from app.routers.standard_terms import router as standard_terms_router
from app.routers.standard_term_rules import router as standard_term_rules_router
from app.tasks import broker


logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_extensions()
    await create_tables()
    await add_generated_columns()
    await load_sample_data()
    await broker.startup()
    yield
    await broker.shutdown()

app = FastAPI(
    title="Ironbad Backend",
    description="Contract Lifecycle Management API",
    version="0.1.0",
    lifespan=lifespan
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(index_router)
app.include_router(contracts_router)
app.include_router(ingestion_router)
app.include_router(standard_terms_router)
app.include_router(standard_term_rules_router)
