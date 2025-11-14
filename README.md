# Ironbad

> 🚧 **Under Construction** 🚧  
> This project is a work in progress. Features, documentation, and APIs are subject to change.

An AI-Powered Contract Lifecycle Management (CLM) platform built with FastAPI and Next.js. This project takes inspiration from [Ironclad](https://ironcladapp.com/) and serves as a sample project to explore various LLM/GenAI tools and methodologies for document processing, Q&A, structured workflows, and agents.

## Overview

Ironbad provides an end-to-end solution for contract review, leveraging AI to automate ingestion, analysis, and redlining workflows. The platform parses contracts into a tree of structured sections, maps sections to standard clauses, identifies compliance issues, and offers both a RAG-based Q&A chat and an AI agent capable of making contract annotations and revisions as well as answering questions with citations to relevant contract sections. Users may view/edit contract sections and manage annotations (comments, revisions, section adds/removes) either manually or collaboratively with the AI agent in the interactive redlining UI. The agent chat supports pinning attachments including precedent documents, specific contract sections, or highlighted text spans for additional context.

## Tech Stack

### Backend
- **Language:** Python 3.11
- **Framework:** FastAPI
- **Database:** PostgreSQL 15+ with pgvector extension
- **ORM:** SQLAlchemy 2.0 (async)
- **Cache/Queue:** Redis 7+
- **Async Tasks:** Taskiq with Redis broker
- **LLM:** OpenAI GPT-4.1 (workflows), GPT-5 (agents), TEXT-EMBEDDING-SMALL (embeddings)
- **PDF/DOCX Parsing:** IBM Docling
- **Agent Framework:** OpenAI Agents SDK
- **Tracing/Observability:** Pydantic Logfire, OpenAI Tracing
- **Real-Time Communication:** Server-Sent Events (SSE)

### Frontend
- **Framework:** Next.js 14 (Pages Router)
- **Language:** TypeScript (strict mode)
- **UI Library:** React 18
- **PDF Rendering:** react-pdf + pdfjs-dist
- **Markdown Rendering:** react-markdown

## Core Features

### 1. Contract Upload & Ingestion
- Upload PDF/DOCX contracts via drag-and-drop interface
- Background processing pipeline: PDF → Markdown → Sections → Embeddings
- Real-time status updates via SSE notifications
- Stores file binaries, metadata, and structured content in PostgreSQL

### 2. Intelligent Contract Analysis
- Automatic clause extraction and categorization
- Standard clause template matching using semantic similarity (pgvector)
- Rule-based compliance evaluation against policy requirements
- AI-powered issue detection with severity levels (critical/warning)
- Generates actionable revision suggestions based on standard clause language

### 3. Contract Q&A Chat (RAG)
- Conversational interface for querying contract content
- Retrieval-Augmented Generation (RAG) with vector search
- Citation extraction with section references
- Conversation history and threading
- Streaming responses with SSE

### 4. AI Contract Agent
- OpenAI native agent with custom tool-calling capabilities
- Attachments: pin precedent documents to guide revisions, pin specific contract sections and/or text spans for context
- Actions: answer questions with citations, analyze compliance against policy rules, add comments, propose revisions, suggest section adds/removes
- Real-time progress tracking with task list and full agent trace (reasoning, tool calls, outputs)
- Streaming responses with live updates
- Integrated with contract review workflow

### 5. Contract Review Workspace
- Interactive collapsible section tree with inline annotations
- Comment management with resolution tracking
- Revision proposals with AI-assisted and manual workflows
- Section operation suggestions (add/remove)
- Unified changelog showing all modifications
- Side-by-side agent chat for guided redlining

### 6. Standard Clause Templates
- Configurable policy clause library
- Rule definitions for compliance checking
- YAML-based sample data for seeding
- CRUD operations via REST API

### 7. Prompt Library
- Save prompts to use later during contract review with the AI agent
- Prompts may include template variables that are resolved at execution time

### 8. Real-time Notifications
- Long-lived SSE connection for push-based status updates from the backend
- Redis pub/sub for multi-client broadcasting
- Toast notifications in UI for user feedback
- Event types: ingestion progress, analysis completion, errors

## Future Enhancements

- Document version control and diff visualization
- DOCX import/export for annotated contracts
- Live collaborative contract editing (OnlyOffice, Collabora, etc.)
- Fine-tuned models for improved compliance classification

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
│   │   │   ├── notifications/          # SSE notifications
│   │   │   ├── saved_prompts/          # Prompt templates
│   │   │   ├── standard_clauses/       # Policy clause templates
│   │   │   ├── standard_clause_rules/  # Compliance rules
│   │   │   └── workflows/              # Background ingestion tasks
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

## Architecture Documentation

For detailed architecture information, see:
- [Backend Architecture Guide](backend/BACKEND_ARCHITECTURE.md)
- [Frontend Architecture Guide](frontend/FRONTEND_ARCHITECTURE.md)

## License

See [LICENSE](LICENSE) file for details.

## Acknowledgments

Feature inspiration from [Ironclad](https://ironcladapp.com/), a leading CLM platform.
