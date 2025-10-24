# Backend Architecture Guide

## Tech Stack Details

- **Framework:** FastAPI 0.x (async)
- **Language:** Python 3.11+
- **ORM:** SQLAlchemy 2.0 (async)
- **Database:** PostgreSQL 15+ with pgvector extension
- **Cache/Queue:** Redis 7+
- **Task Queue:** Taskiq with Redis broker
- **LLM:** OpenAI API (GPT-4, GPT-5, embeddings)
- **PDF/DOCX:** Docling for document parsing/extraction
- **Observability:** Pydantic Logfire (optional)

## Directory Structure

```
backend/app/
├── main.py                        # FastAPI app initialization, CORS, lifespan
├── models.py                      # All SQLAlchemy ORM models
├── enums.py                       # Shared enums (ContractStatus, FileType, etc.)
├── prompts.py                     # LLM prompt templates
├── core/                          # Infrastructure & configuration
│   ├── config.py                  # Settings (Pydantic BaseSettings)
│   ├── db.py                      # Database engine & session factory
│   └── lifespan.py                # Startup tasks (tables, extensions, sample data)
├── api/                           # API layer (cross-cutting)
│   ├── router.py                  # Main router aggregator (imports all feature routers)
│   ├── deps.py                    # Shared dependencies (get_db, etc.)
│   └── system.py                  # Health check & root endpoints
├── common/                        # Shared schemas & utilities
│   └── schemas.py                 # Base Pydantic models, common schemas
├── utils/                         # Shared utility functions
│   ├── common.py                  # Token counting, string utilities
│   └── embeddings.py              # OpenAI embedding generation
├── features/                      # Feature modules (vertical slices)
│   ├── contract/                  # Core contract CRUD
│   │   ├── api.py                 # 7 endpoints: upload, list, get, contents, update, delete
│   │   └── schemas.py             # (optional, uses common schemas)
│   ├── contract_agent/            # OpenAI agent for contract actions
│   │   ├── api.py                 # Agent endpoints
│   │   ├── agent.py               # Agent configuration
│   │   ├── tools.py               # Agent tool definitions
│   │   ├── services.py            # Business logic
│   │   ├── events.py              # SSE streaming
│   │   └── schemas.py             # Request/response models
│   ├── contract_annotations/      # Comments, revisions, section operations
│   │   ├── api.py                 # 3 endpoints: actions, resolve, delete
│   │   ├── services.py            # Complex annotation logic
│   │   └── schemas.py             # Annotation types
│   ├── contract_chat/             # Contract Q&A with RAG
│   │   ├── api.py                 # 7 endpoints: messages, threads
│   │   ├── services.py            # RAG retrieval, citation extraction
│   │   ├── events.py              # SSE streaming for chat
│   │   └── schemas.py             # Chat message/thread models
│   ├── contract_clauses/          # Clause retrieval
│   │   ├── api.py                 # 2 GET endpoints
│   │   └── schemas.py
│   ├── contract_issues/           # Issue management with AI revisions
│   │   ├── api.py                 # 6 endpoints: CRUD + AI/user revisions
│   │   └── schemas.py
│   ├── contract_sections/         # Section retrieval
│   │   ├── api.py                 # 2 GET endpoints with filtering
│   │   └── schemas.py
│   ├── notifications/             # SSE notification stream
│   │   ├── api.py                 # Long-lived SSE endpoint
│   │   ├── client.py              # Redis client singleton
│   │   ├── deps.py                # PubSub dependency
│   │   └── schemas.py             # Notification event models
│   ├── standard_clauses/          # Policy clause templates
│   │   ├── api.py                 # CRUD endpoints
│   │   └── schemas.py
│   ├── standard_clause_rules/     # Rules for standard clauses
│   │   ├── api.py                 # CRUD endpoints
│   │   └── schemas.py
│   └── workflows/                 # Background tasks
│       ├── api.py                 # Workflow trigger endpoints
│       ├── tasks.py               # Taskiq task definitions
│       ├── ingestion.py           # PDF parsing & embedding pipeline
│       ├── analysis.py            # Clause matching & issue detection
│       └── schemas.py             # Workflow-specific models
└── sample_data/                   # YAML files for seeding
    ├── standard_clauses.yml
    └── standard_clause_rules.yml
```

## Core Principles

1. **Feature-Based Organization**
   - Each feature is a vertical slice (routes + logic + schemas)
   - Features are self-contained with minimal cross-dependencies
   - Import models/enums from root, but keep feature logic isolated

2. **Async-First**
   - All database operations use `async`/`await`
   - SQLAlchemy async sessions via `AsyncSession`
   - Use `asyncio.gather()` for concurrent operations

3. **Type Safety**
   - Pydantic schemas for request/response validation
   - SQLAlchemy ORM models for database entities
   - Clear separation: DB models vs. API schemas

4. **Dependency Injection**
   - FastAPI dependencies for DB sessions, auth, etc.
   - Pattern: `db: AsyncSession = Depends(get_db)`
   - Centralized in `api/deps.py` (or feature-specific `deps.py`)

5. **Error Handling**
   - Always raise `HTTPException` with proper status codes
   - Log errors with context before raising
   - Try/catch with db rollback on failures

## Key Features & Workflows

### Contract Upload & Ingestion
- **Upload:** `POST /contracts` - Store file binary in database
- **Ingestion:** `POST /contracts/{id}/ingest` - Trigger background task
- **Pipeline:** PDF → Markdown → Sections → Embeddings → Database
- **Status Updates:** Redis pub/sub → SSE notifications to frontend

### Contract Analysis
- **Trigger:** `POST /contracts/{id}/analyze`
- **Process:** Clause matching → Rule evaluation → Issue detection
- **Output:** ContractClause and ContractIssue records

### Contract Chat (RAG)
- **Endpoint:** `POST /contracts/{id}/chat/messages`
- **Flow:** Query → Embedding → Vector search → Context injection → LLM
- **Features:** Conversation history, citation extraction, streaming responses

### Contract Agent
- **Endpoint:** `POST /contracts/{id}/agent/chat`
- **Tools:** Make comments, revisions, section operations
- **Architecture:** OpenAI native agents with custom tools

### Notifications
- **Endpoint:** `GET /notifications` (long-lived SSE)
- **Transport:** Redis pub/sub → SSE stream
- **Events:** Status updates, task completions, errors

## Making Changes

### Adding a New Feature
1. Create directory in `features/`: `features/my_feature/`
2. Add `api.py` with router:
   ```python
   router = APIRouter()
   ```
3. Add `schemas.py` with Pydantic models
4. Register router in `api/router.py`:
   ```python
   from app.features.my_feature.api import router as my_feature_router
   router.include_router(my_feature_router)
   ```

### Adding a New Model
1. Add to `models.py`:
   ```python
   class MyModel(Base):
       __tablename__ = "my_table"
       id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
       # ... other columns
   ```
2. Create migration (if using Alembic) or rely on `create_tables()` in development

### Adding a New Endpoint
1. Add route handler to feature's `api.py`
2. Define schemas in feature's `schemas.py`
3. Tag appropriately: `tags=["feature_name"]`
4. Follow error handling pattern (try/except/HTTPException)

### Adding Business Logic
1. Create `services.py` in the feature directory
2. Extract complex logic from `api.py` into service functions:
   ```python
   async def process_item(db: AsyncSession, item_id: UUID) -> Result:
       # Complex business logic here
       pass
   ```
3. Call from route handler

### Adding a Background Task
1. Define task in `features/workflows/tasks.py`:
   ```python
   @broker.task
   async def my_task(param: str):
       async with SessionLocal() as db:
           # Task logic
           pass
   ```
2. Trigger with `.kiq()`: `await my_task.kiq(param="value")`

## Important Notes

### Database Sessions
- **Never** share sessions across requests
- Always use `async with` or dependency injection
- Commit explicitly after writes: `await db.commit()`
- Rollback on errors: `await db.rollback()`

### Async Patterns
- Use `await` for all database operations
- Use `asyncio.gather()` for concurrent operations:
  ```python
  results = await asyncio.gather(query1, query2, query3)
  ```
- Never use blocking I/O (use `asyncio` alternatives)

### Vector Embeddings
- Use `app.utils.embeddings.get_text_embedding()` for OpenAI embeddings
- Store in pgvector columns: `Vector(dim=1536)`
- Query with cosine similarity:
  ```python
  .order_by(MyModel.embedding.cosine_distance(search_embedding))
  ```

### Configuration
- All settings in `core/config.py` (Pydantic BaseSettings)
- Load from environment variables or `.env` file
- Access via `from app.core.config import settings`

### Redis Pub/Sub
- Client singleton: `features/notifications/client.py`
- Publish: `await redis.publish(channel, json.dumps(message))`
- Subscribe: Use `get_pubsub()` dependency

### Logging
- Use Python `logging` module
- Pattern: `logger = logging.getLogger(__name__)`
- Log before raising exceptions: `logger.error("msg", exc_info=True)`

## Recommendations for Future Work

**High Priority:**
- Consider moving `models.py` and `enums.py` to `common/` directory
- Add proper database migrations with Alembic
- Add request/response examples to OpenAPI docs

**Medium Priority:**
- Standardize feature naming (remove `contract_` prefix)
- Add `__init__.py` to features for cleaner imports
- Extract prompts to feature directories where used

**Low Priority:**
- Add authentication/authorization layer
- Add rate limiting for API endpoints
- Consider separating thin features (clauses, sections, issues) into larger domain groups
- Add integration tests for critical workflows

## Development Commands

```bash
# Start services
docker-compose up

# Run backend (with reload)
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run task worker
cd backend
taskiq worker app.features.workflows.tasks:broker

# Shell access
docker exec -it ironbad-backend bash

# Database access
docker exec -it ironbad-database psql -U postgres -d ironbad
```
