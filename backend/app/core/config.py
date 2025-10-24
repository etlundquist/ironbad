import json
import logging

from pathlib import Path
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """application settings from environment variables, local container files, or default values"""

    # settings configuration
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    # application/environment settings
    app_name: str = Field(default="Ironbad Backend")
    app_version: str = Field(default="0.1.0")
    app_description: str = Field(default="Contract Lifecycle Management API")
    environment: Literal["dev", "staging", "prod"] = Field(default="dev")
    debug: bool = Field(default=False)
    log_level: str = Field(default="INFO")

    # server settings
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
    reload: bool = Field(default=True)

    # CORS settings
    cors_origins: list[str] = Field(default=["*"])
    cors_credentials: bool = Field(default=True)
    cors_methods: list[str] = Field(default=["*"])
    cors_headers: list[str] = Field(default=["*"])

    # database settings
    database_url: PostgresDsn = Field(default="postgresql+asyncpg://postgres:password@database:5432/ironbad", description="database connection string using asyncpg driver")
    db_echo: bool = Field(default=False, description="echo SQL queries to console")
    db_pool_size: int = Field(default=5, description="database connection pool size")
    db_max_overflow: int = Field(default=10, description="maximum number of database connections to create beyond pool size")

    # redis settings
    redis_url: RedisDsn = Field(default="redis://redis:6379", description="Redis connection URL")
    redis_max_connections: int = Field(default=100, description="Maximum Redis connections in pool")
    redis_socket_connect_timeout: int = Field(default=5, description="Redis socket connection timeout in seconds")
    redis_notifications_channel: str = Field(default="notifications", description="Redis channel for notifications")

    # taskiq (task queue) settings
    taskiq_result_ex_time: int = Field(default=3600, description="Task result expiration time in seconds")
    taskiq_queue_name: str = Field(default="ingestion", description="Taskiq queue name")
    taskiq_consumer_group_name: str = Field(default="ingestion", description="Taskiq consumer group name")
    taskiq_unacknowledged_batch_size: int = Field(default=1, description="Number of unacknowledged messages")
    taskiq_xread_count: int = Field(default=1, description="Number of messages to read at once")

    # openai settings
    openai_api_key: str = Field(..., description="OpenAI API key")
    openai_embedding_model: str = Field(default="text-embedding-3-small", description="OpenAI embedding model")
    openai_chat_model: str = Field(default="gpt-4o", description="OpenAI chat model")
    openai_agent_model: str = Field(default="gpt-5-mini", description="OpenAI agent model")
    openai_max_concurrent_requests: int = Field(default=10, description="Maximum concurrent OpenAI API requests")
    openai_embedding_max_tokens: int = Field(default=8192, description="Maximum tokens for embedding input")

    # logfire settings (observability)
    logfire_token: str | None = Field(default=None, description="Logfire token for observability")
    logfire_project_name: str | None = Field(default=None, description="Logfire project name")
    logfire_project_url: str | None = Field(default=None, description="Logfire project URL")
    logfire_api_url: str | None = Field(default=None, description="Logfire API URL")
    logfire_enabled: bool = Field(default=True, description="Enable Logfire instrumentation")

    # application constants
    max_upload_file_size: int = Field(default=10 * 1024 * 1024, description="Maximum upload file size in bytes (10MB)")
    embedding_vector_dimension: int = Field(default=1536, description="Embedding vector dimension for text-embedding-3-small")
    max_standard_clause_rules: int = Field(default=10, description="Maximum number of rules per standard clause")

    # sample data settings
    sample_data_standard_clauses_path: str = Field(default="app/sample_data/standard_clauses.yml", description="Path to standard clauses sample data")
    sample_data_standard_clause_rules_path: str = Field(default="app/sample_data/standard_clause_rules.yml", description="Path to standard clause rules sample data")


    def model_post_init(self, __context) -> None:
        """post-init hook to load credentials from local files if not set via environment variables"""

        if not any([self.logfire_token, self.logfire_project_name, self.logfire_project_url, self.logfire_api_url]):
            self._load_logfire_credentials()


    def _load_logfire_credentials(self) -> None:
        """load logfire credentials from .logfire/logfire_credentials.json file"""

        logfire_credentials_path = Path(".logfire/logfire_credentials.json")
        if logfire_credentials_path.exists():
            try:
                with open(logfire_credentials_path, "r") as f:
                    credentials = json.load(f)
                if not self.logfire_token and credentials.get("token"):
                    self.logfire_token = credentials["token"]
                if not self.logfire_project_name and credentials.get("project_name"):
                    self.logfire_project_name = credentials["project_name"]
                if not self.logfire_project_url and credentials.get("project_url"):
                    self.logfire_project_url = credentials["project_url"]
                if not self.logfire_api_url and credentials.get("logfire_api_url"):
                    self.logfire_api_url = credentials["logfire_api_url"]
                logger.info("loaded logfire credentials from .logfire/logfire_credentials.json")
            except (json.JSONDecodeError, KeyError, OSError):
                logger.error("failed to load logfire credentials", exc_info=True)
                self.logfire_enabled = False

settings = Settings()
"""singleton instance of the application settings"""
