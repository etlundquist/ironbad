import uuid

from sqlalchemy import Column, String, Integer, DateTime, Enum, JSON, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, BYTEA
from sqlalchemy.orm import DeclarativeBase, relationship

from app.enums import ContractStatus, FileType, ContractSectionType
from app.constants import EMBEDDING_VECTOR_DIMENSION

from pgvector.sqlalchemy import Vector

class Base(DeclarativeBase):
    pass


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

