import uuid

from sqlalchemy import Column, String, DateTime, Enum, JSON
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, BYTEA
from sqlalchemy.orm import DeclarativeBase

from app.enums import ContractStatus, FileType


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
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
