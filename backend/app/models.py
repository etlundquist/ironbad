import uuid

from sqlalchemy import Boolean, Column, String, Integer, DateTime, Enum, JSON, ForeignKey, ARRAY
from sqlalchemy.dialects.postgresql import UUID, BYTEA
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

from app.enums import ContractStatus, FileType, ContractSectionType, IssueResolution, RuleSeverity, IssueStatus, ChatMessageStatus, ChatMessageRole
from app.core.config import settings


class Base(DeclarativeBase):
    pass


class StandardClause(Base):
    __tablename__ = "standard_clauses"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, unique=True)
    display_name = Column(String, nullable=False)
    description = Column(String, nullable=False)
    standard_text = Column(String, nullable=False)
    embedding = Column(Vector(dim=settings.embedding_vector_dimension), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    rules = relationship("StandardClauseRule", back_populates="standard_clause")


class StandardClauseRule(Base):
    __tablename__ = "standard_clause_rules"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    standard_clause_id = Column(UUID(as_uuid=True), ForeignKey(column="standard_clauses.id", ondelete="CASCADE"), nullable=False)
    severity = Column(Enum(RuleSeverity), nullable=False)
    title = Column(String, nullable=False)
    text = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    standard_clause = relationship("StandardClause", back_populates="rules")


class Contract(Base):
    __tablename__ = "contracts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(Enum(ContractStatus), nullable=False)
    filename = Column(String, nullable=False, unique=True)
    filetype = Column(Enum(FileType), nullable=False)
    contents = Column(BYTEA, nullable=False)
    markdown = Column(String, nullable=True)
    section_tree = Column(JSON, nullable=True)
    annotations = Column(JSON, nullable=True)
    version = Column(Integer, nullable=False)
    meta = Column(JSON, nullable=True)
    errors = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    sections = relationship("ContractSection", back_populates="contract")
    clauses = relationship("ContractClause", back_populates="contract")


class ContractSection(Base):
    __tablename__ = "contract_sections"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contract_id = Column(UUID(as_uuid=True), ForeignKey(column="contracts.id", ondelete="CASCADE"), nullable=False)
    type = Column(Enum(ContractSectionType), nullable=False)
    level = Column(Integer, nullable=False)
    number = Column(String, nullable=False)
    name = Column(String, nullable=True)
    markdown = Column(String, nullable=False)
    embedding = Column(Vector(dim=settings.embedding_vector_dimension), nullable=True)
    beg_page = Column(Integer, nullable=False)
    end_page = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    contract = relationship("Contract", back_populates="sections")


class ContractClause(Base):
    __tablename__ = "contract_clauses"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    standard_clause_id = Column(UUID(as_uuid=True), ForeignKey(column="standard_clauses.id", ondelete="CASCADE"), nullable=False)
    contract_id = Column(UUID(as_uuid=True), ForeignKey(column="contracts.id", ondelete="CASCADE"), nullable=False)
    contract_sections = Column(ARRAY(UUID(as_uuid=True)), nullable=False)
    raw_markdown = Column(String, nullable=False)
    cleaned_markdown = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    standard_clause = relationship("StandardClause")
    contract = relationship("Contract", back_populates="clauses")


class ContractIssue(Base):
    __tablename__ = "contract_issues"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    standard_clause_id = Column(UUID(as_uuid=True), ForeignKey(column="standard_clauses.id", ondelete="CASCADE"), nullable=False)
    standard_clause_rule_id = Column(UUID(as_uuid=True), ForeignKey(column="standard_clause_rules.id", ondelete="CASCADE"), nullable=False)
    contract_id = Column(UUID(as_uuid=True), ForeignKey(column="contracts.id", ondelete="CASCADE"), nullable=False)
    relevant_text = Column(String, nullable=False)
    explanation = Column(String, nullable=False)
    citations = Column(JSON, nullable=True)
    status = Column(Enum(IssueStatus), nullable=False)
    resolution = Column(Enum(IssueResolution), nullable=True)
    ai_suggested_revision = Column(String, nullable=True)
    user_suggested_revision = Column(String, nullable=True)
    active_suggested_revision = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    standard_clause = relationship("StandardClause")
    standard_clause_rule = relationship("StandardClauseRule")
    contract = relationship("Contract")


class ContractChatThread(Base):
    __tablename__ = "contract_chat_threads"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contract_id = Column(UUID(as_uuid=True), ForeignKey(column="contracts.id", ondelete="CASCADE"), nullable=False)
    archived = Column(Boolean, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    contract = relationship("Contract")


class ContractChatMessage(Base):
    __tablename__ = "contract_chat_messages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contract_id = Column(UUID(as_uuid=True), ForeignKey(column="contracts.id", ondelete="CASCADE"), nullable=False)
    chat_thread_id = Column(UUID(as_uuid=True), ForeignKey(column="contract_chat_threads.id", ondelete="CASCADE"), nullable=False)
    parent_chat_message_id = Column(UUID(as_uuid=True), ForeignKey(column="contract_chat_messages.id"), nullable=True)
    status = Column(Enum(ChatMessageStatus), nullable=False)
    role = Column(Enum(ChatMessageRole), nullable=False)
    content = Column(String, nullable=False)
    citations = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    contract = relationship("Contract")
    chat_thread = relationship("ContractChatThread")


class AgentChatThread(Base):
    __tablename__ = "agent_chat_threads"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contract_id = Column(UUID(as_uuid=True), ForeignKey(column="contracts.id", ondelete="CASCADE"), nullable=False)
    openai_conversation_id = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    contract = relationship("Contract")

class AgentChatMessage(Base):
    __tablename__ = "agent_chat_messages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contract_id = Column(UUID(as_uuid=True), ForeignKey(column="contracts.id", ondelete="CASCADE"), nullable=False)
    chat_thread_id = Column(UUID(as_uuid=True), ForeignKey(column="agent_chat_threads.id", ondelete="CASCADE"), nullable=False)
    status = Column(Enum(ChatMessageStatus), nullable=False)
    role = Column(Enum(ChatMessageRole), nullable=False)
    content = Column(String, nullable=False, default="")
    parent_chat_message_id = Column(UUID(as_uuid=True), ForeignKey(column="agent_chat_messages.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    contract = relationship("Contract")
    chat_thread = relationship("AgentChatThread")
