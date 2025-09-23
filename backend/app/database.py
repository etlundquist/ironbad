import os
import yaml
import asyncio
import logging

from typing import AsyncGenerator
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, AsyncEngine
from sqlalchemy.orm import sessionmaker

from app.dbmodels import Base, StandardTerm, StandardTermRule
from app.enums import RuleSeverity


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


async def create_extensions():
    """add all necessary extensions to the database"""

    async with engine.begin() as cnx:
        await cnx.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))


async def create_tables():
    """apply the table models to the database"""

    async with engine.begin() as cnx:
        await cnx.run_sync(Base.metadata.create_all)


async def load_sample_data():
    """load default/sample data from YAML files into the database"""

    async with AsyncSession(engine) as db:

        query = select(StandardTerm)
        result = await db.execute(query)
        current_standard_terms = result.scalars().all()
        if current_standard_terms:
            logger.info(f"found {len(current_standard_terms)} standard terms in the database - ignoring sample data")
            return

        with open("app/sample_data/standard_terms.yml") as f:
            standard_terms_data = yaml.safe_load(f)["standard_terms"]
            standard_terms = [StandardTerm(**term) for term in standard_terms_data]
            db.add_all(standard_terms)
            await db.commit()
            logger.info(f"seeded {len(standard_terms)} standard terms into the database from sample data")
            for term in standard_terms:
                await db.refresh(term)
            term_id_mapping = {term.name: term.id for term in standard_terms}

        with open("app/sample_data/standard_term_rules.yml") as f:
            standard_term_rulesets = yaml.safe_load(f)["standard_term_rules"]
            for ruleset in standard_term_rulesets:
                term_name = ruleset["standard_term_name"]
                term_id = term_id_mapping.get(term_name)
                if term_id:
                    ruleset["standard_term_id"] = term_id
                else:
                    logger.warning(f"standard term '{term_name}' not found in `standard_terms` - skipping term-specific rules")

            standard_term_rules = [
                StandardTermRule(standard_term_id=ruleset["standard_term_id"], severity=RuleSeverity(rule["severity"]), title=rule["title"], text=rule["text"])
                for ruleset in standard_term_rulesets for rule in ruleset["rules"] if ruleset["standard_term_id"]
            ]
            db.add_all(standard_term_rules)
            await db.commit()
            logger.info(f"seeded {len(standard_term_rules)} rules from {len(standard_term_rulesets)} rulesets into the database from sample data")


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

