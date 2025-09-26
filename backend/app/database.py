import os
import yaml
import asyncio
import logging

from typing import AsyncGenerator
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, AsyncEngine
from sqlalchemy.orm import sessionmaker

from app.models import Base, StandardClause, StandardClauseRule
from app.enums import RuleSeverity
from app.embeddings import get_clause_embeddings


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


async def add_generated_columns():
    """add generated columns on the database"""

    async with engine.begin() as cnx:

        # add a generated text-search-vector column to the contract_sections table
        await cnx.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contract_sections' AND column_name = 'tsv')
            THEN EXECUTE '
                ALTER TABLE contract_sections
                ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
                    to_tsvector(''english'', coalesce(name, '''') || '' '' || coalesce(markdown, ''''))
                ) STORED';
            END IF;
        END $$;
        """))


async def load_sample_data():
    """load default/sample data from YAML files into the database"""

    async with AsyncSession(engine) as db:

        query = select(StandardClause)
        result = await db.execute(query)
        current_standard_clauses = result.scalars().all()
        if current_standard_clauses:
            logger.info(f"found {len(current_standard_clauses)} standard clauses in the database - ignoring sample data")
            return

        with open("app/sample_data/standard_clauses.yml") as f:
            standard_clauses_data = yaml.safe_load(f)["standard_clauses"]
            standard_clauses = [StandardClause(**clause) for clause in standard_clauses_data]
            clause_embeddings = await get_clause_embeddings(clauses=standard_clauses)
            for clause, embedding in zip(standard_clauses, clause_embeddings):
                clause.embedding = embedding
            db.add_all(standard_clauses)
            await db.commit()
            logger.info(f"seeded {len(standard_clauses)} standard clauses into the database from sample data")
            for clause in standard_clauses:
                await db.refresh(clause)
            clause_id_mapping = {clause.name: clause.id for clause in standard_clauses}

        with open("app/sample_data/standard_clause_rules.yml") as f:
            standard_clause_rulesets = yaml.safe_load(f)["standard_clause_rules"]
            for ruleset in standard_clause_rulesets:
                clause_name = ruleset["standard_clause_name"]
                clause_id = clause_id_mapping.get(clause_name)
                if clause_id:
                    ruleset["standard_clause_id"] = clause_id
                else:
                    logger.warning(f"standard clause '{clause_name}' not found in `standard_clauses` - skipping clause-specific rules")

            standard_clause_rules = [
                StandardClauseRule(standard_clause_id=ruleset["standard_clause_id"], severity=RuleSeverity(rule["severity"]), title=rule["title"], text=rule["text"])
                for ruleset in standard_clause_rulesets for rule in ruleset["rules"] if ruleset.get("standard_clause_id")
            ]
            db.add_all(standard_clause_rules)
            await db.commit()
            logger.info(f"seeded {len(standard_clause_rules)} rules from {len(standard_clause_rulesets)} rulesets into the database from sample data")


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

