import logging
import logfire

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.lifespan import create_extensions, create_tables, add_generated_columns, load_sample_data
from app.features.notifications.client import get_notifications_client, close_notifications_client
from app.api.router import router


logging.basicConfig(level=getattr(logging, settings.log_level.upper()))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_extensions()
    await create_tables()
    await add_generated_columns()
    await load_sample_data()
    await get_notifications_client()
    yield
    await close_notifications_client()

app = FastAPI(
    title=settings.app_name,
    description=settings.app_description,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_credentials,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
)
app.include_router(router)

if settings.logfire_enabled:
    logfire.configure()
    logfire.instrument_fastapi(app)
    logfire.instrument_openai_agents()
