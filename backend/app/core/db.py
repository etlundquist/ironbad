import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, AsyncEngine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


engine: AsyncEngine = create_async_engine(str(settings.database_url), echo=settings.db_echo, pool_size=settings.db_pool_size, max_overflow=settings.db_max_overflow)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=AsyncSession)


logger = logging.getLogger(__name__)


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

