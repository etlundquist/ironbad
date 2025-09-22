import os
import asyncio
import logging

from typing import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, AsyncEngine
from sqlalchemy.orm import sessionmaker

from app.dbmodels import Base


logger = logging.getLogger(__name__)
database_url = os.environ['DATABASE_URL']
engine: AsyncEngine = create_async_engine(database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """get a new async database session"""

    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def create_tables():
    """apply the table models to the database"""

    async with engine.begin() as cnx:
        await cnx.run_sync(Base.metadata.create_all)


async def test_connection():
    """test the database connection"""

    async with engine.connect() as cnx:
        try:
            result = await cnx.execute(text("SELECT NOW()"))
            current_time = result.fetchone()
            logger.info("database connection successful - current time:", current_time[0])
        except Exception as e:
            logger.error("database connection failed:", str(e))
        finally:
            await cnx.close()


if __name__ == "__main__":
    asyncio.run(test_connection())

