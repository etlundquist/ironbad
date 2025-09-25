import uuid

from sqlalchemy import Column, String, Integer, DateTime, Enum, JSON, ForeignKey, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, BYTEA, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, relationship

from app.enums import ContractStatus, FileType, ContractSectionType, RuleSeverity
from app.constants import EMBEDDING_VECTOR_DIMENSION

from pgvector.sqlalchemy import Vector

class Base(DeclarativeBase):
    pass


class StandardTerm(Base):
    __tablename__ = "standard_terms"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, unique=True)
    display_name = Column(String, nullable=False)
    description = Column(String, nullable=False)
    standard_text = Column(String, nullable=False)
    embedding = Column(Vector(dim=EMBEDDING_VECTOR_DIMENSION), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    rules = relationship("StandardTermRule", back_populates="standard_term", cascade="all, delete")


class StandardTermRule(Base):
    __tablename__ = "standard_term_rules"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    standard_term_id = Column(UUID(as_uuid=True), ForeignKey(column="standard_terms.id", ondelete="CASCADE"), nullable=False)
    severity = Column(Enum(RuleSeverity), nullable=False)
    title = Column(String, nullable=False)
    text = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    standard_term = relationship("StandardTerm", back_populates="rules")


class Contract(Base):
    __tablename__ = "contracts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(Enum(ContractStatus), nullable=False)
    filename = Column(String, nullable=False, unique=True)
    filetype = Column(Enum(FileType), nullable=False)
    contents = Column(BYTEA, nullable=False)
    markdown = Column(String, nullable=True)
    meta = Column(JSON, nullable=True)
    errors = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    sections = relationship("ContractSection", back_populates="contract", cascade="all, delete")


class ContractSection(Base):
    __tablename__ = "contract_sections"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contract_id = Column(UUID(as_uuid=True), ForeignKey(column="contracts.id", ondelete="CASCADE"), nullable=False)
    type = Column(Enum(ContractSectionType), nullable=False)
    level = Column(Integer, nullable=False)
    number = Column(String, nullable=False)
    name = Column(String, nullable=True)
    markdown = Column(String, nullable=False)
    embedding = Column(Vector(dim=EMBEDDING_VECTOR_DIMENSION), nullable=True)
    beg_page = Column(Integer, nullable=False)
    end_page = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    contract = relationship("Contract", back_populates="sections")


class ContractTerm(Base):
    __tablename__ = "contract_terms"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    standard_term_id = Column(UUID(as_uuid=True), ForeignKey(column="standard_terms.id", ondelete="CASCADE"), nullable=False)
    contract_id = Column(UUID(as_uuid=True), ForeignKey(column="contracts.id", ondelete="CASCADE"), nullable=False)
    contract_sections = Column(ARRAY(UUID(as_uuid=True)), nullable=False)
    raw_markdown = Column(String, nullable=False)
    cleaned_markdown = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
