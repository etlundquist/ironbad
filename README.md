# Ironbad

An AI-enabled Contract Lifecycle Management (CLM) platform built with FastAPI and Next.js. This project takes inspiration from [Ironclad](https://ironcladapp.com/) and serves as a sample implementation exploring various LLM/GenAI tools and methodologies for contract analysis, Q&A, and intelligent document redlining.

## Overview

Ironbad provides an end-to-end solution for contract management, leveraging AI to automate ingestion, analysis, and review workflows. The platform parses contracts into structured sections, matches input sections to standard clauses, identifies compliance issues, and offers both a simple RAG-based Q&A chat and an AI agent capable of making contract annotations and revisions as well as answering questions with rich inline citations. Users may view/edit contract sections and make/edit/resolve annotations including comments, revisions, section adds, and section removes themselves or collaboratively with an AI agent.

## Tech Stack

### Backend
- **Framework:** FastAPI 0.x (async)
- **Language:** Python 3.11+
- **Database:** PostgreSQL 15+ with pgvector extension
- **ORM:** SQLAlchemy 2.0 (async)
- **Cache/Queue:** Redis 7+
- **Task Queue:** Taskiq with Redis broker
- **LLM:** OpenAI API (GPT-4o, GPT-5-preview, text-embedding-3-small)
- **PDF/DOCX Parsing:** Docling
- **Observability:** Pydantic Logfire (optional)
- **Agent Framework:** OpenAI Agents SDK

### Frontend
- **Framework:** Next.js 14 (Pages Router)
- **Language:** TypeScript (strict mode)
- **UI Library:** React 18
- **PDF Rendering:** react-pdf + pdfjs-dist
- **Markdown Rendering:** react-markdown
- **Real-time Communication:** Server-Sent Events (SSE)

### Infrastructure
- **Containerization:** Docker & Docker Compose
- **Database Migrations:** SQLAlchemy table creation (development), Alembic-ready
- **Environment Management:** python-dotenv, uv for Python dependencies

## Core Features

### 1. Contract Upload & Ingestion
- Upload PDF/DOCX contracts via drag-and-drop interface
- Background processing pipeline: PDF → Markdown → Sections → Embeddings
- Real-time status updates via SSE notifications
- Stores file binaries, metadata, and structured content in PostgreSQL

### 2. Intelligent Contract Analysis
- Automatic clause extraction and categorization
- Policy template matching using semantic similarity (pgvector)
- Rule-based compliance evaluation
- AI-powered issue detection with severity levels
- Generates actionable insights and recommendations

### 3. Contract Q&A Chat (RAG)
- Conversational interface for querying contract content
- Retrieval-Augmented Generation (RAG) with vector search
- Citation extraction with section references
- Conversation history and threading
- Streaming responses with SSE

### 4. AI Contract Agent
- OpenAI native agent with custom tool-calling capabilities
- Actions: add comments, propose revisions, suggest section adds/removes
- Real-time progress tracking with tool call visualization
- Streaming responses showing reasoning and actions
- Integration with contract review workflow

### 5. Contract Review Workspace
- Interactive section tree with inline annotations
- Comment management with resolution tracking
- Revision proposals with AI and manual workflows
- Section operation suggestions (add/remove)
- Unified changelog showing all modifications
- Side-by-side agent chat for guided redlining

### 6. Standard Clause Templates
- Configurable policy clause library
- Rule definitions for compliance checking
- YAML-based sample data for seeding
- CRUD operations via REST API

### 7. Real-time Notifications
- Long-lived SSE connection for status updates
- Redis pub/sub for multi-client broadcasting
- Toast notifications in UI for user feedback
- Event types: ingestion progress, analysis completion, errors

## Project Structure

```
ironbad/
├── backend/                            
│   ├── app/                            # FastAPI application
│   │   ├── api/                        # Cross-cutting API layer
│   │   ├── core/                       # Configuration & database
│   │   ├── features/                   # Feature modules (vertical slices)
│   │   │   ├── contract/               # Contract CRUD
│   │   │   ├── contract_agent/         # AI agent with tools
│   │   │   ├── contract_annotations/   # Comments, revisions, sections
│   │   │   ├── contract_chat/          # RAG-based Q&A
│   │   │   ├── contract_clauses/       # Clause retrieval
│   │   │   ├── contract_issues/        # Issue management
│   │   │   ├── contract_sections/      # Section retrieval
│   │   │   ├── notifications/          # SSE stream
│   │   │   ├── standard_clauses/       # Policy templates
│   │   │   ├── standard_clause_rules/  # Compliance rules
│   │   │   └── workflows/              # Background tasks
│   │   ├── models.py                   # SQLAlchemy ORM models
│   │   ├── enums.py                    # Shared enumerations
│   │   ├── prompts.py                  # LLM prompt templates
│   │   └── utils/                      # Embeddings, common utilities
│   ├── pyproject.toml                  # Python dependencies (uv)
│   └── BACKEND_ARCHITECTURE.md
│
├── frontend/                  # Next.js application
│   ├── pages/                 # Routes & page components
│   ├── components/            # Reusable UI components
│   ├── hooks/                 # Custom React hooks
│   ├── lib/
│   │   ├── api/               # Backend API client functions
│   │   ├── types/             # TypeScript type definitions
│   │   └── utils/             # Date formatting, icons
│   ├── package.json
│   └── FRONTEND_ARCHITECTURE.md
│
├── sample_contracts/           # Example PDFs for testing
├── sample_output/              # Sample processed contract outputs
└── docker-compose.yml          # Service orchestration
```

## Usage Workflow

1. **Upload Contract:** Navigate to `/upload` and drag-and-drop a PDF or DOCX file
2. **Ingest:** Click "Ingest" on the contract list to trigger parsing and embedding generation
3. **Analyze:** Click "Analyze" to run clause matching and issue detection
4. **Review:** View extracted clauses and identified issues on the contract detail page
5. **Chat:** Ask questions about the contract content using the RAG-based chat interface
6. **Redline:** Use the review workspace with the AI agent to make annotations and revisions

## Key Technologies & Patterns

### Backend Patterns
- **Async-first:** All I/O operations use `async`/`await`
- **Feature-based organization:** Vertical slices with minimal cross-dependencies
- **Dependency injection:** FastAPI dependencies for sessions and configuration
- **Type safety:** Pydantic schemas for validation, SQLAlchemy models for persistence
- **Background processing:** Taskiq for long-running ingestion and analysis tasks

### Frontend Patterns
- **Type safety:** Full TypeScript with strict mode
- **Separation of concerns:** Pages, components, hooks, API clients, and types
- **Error handling:** Toast notifications for all user feedback
- **Real-time updates:** SSE for contract status changes and agent progress
- **Custom hooks:** Encapsulated business logic (useContract, useAgentChat, etc.)

### AI/LLM Integration
- **Vector search:** pgvector for semantic clause matching
- **RAG pattern:** Context injection from vector-retrieved sections
- **Agent framework:** OpenAI Agents SDK with custom tools for contract operations
- **Streaming:** Token-by-token responses via SSE for better UX
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions)

## Architecture Documentation

For detailed architecture information, see:
- [Backend Architecture Guide](backend/BACKEND_ARCHITECTURE.md)
- [Frontend Architecture Guide](frontend/FRONTEND_ARCHITECTURE.md)

## Future Enhancements

- Multi-user support including authentication and authorization
- Document version control
- Document import/export directly to/from DOCX
- Fine-tuned models for domain-specific extraction

## License

See [LICENSE](LICENSE) file for details.

## Acknowledgments

Feature inspiration from [Ironclad](https://ironcladapp.com/), a leading CLM platform.
