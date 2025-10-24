import os
import re
import logging
import asyncio

from uuid import UUID

from docling.document_converter import DocumentConverter
from openai import AsyncOpenAI
from openai.types.responses import Response, ParsedResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Contract, StandardClause, ContractSection, ContractClause
from app.common.schemas import ContractMetadata, ContractSectionNode, ContractStructuredMetadata
from app.features.workflows.schemas import ParsedContract, ParsedContractSection, SectionRelevanceEvaluation

from app.enums import ContractSectionType
from app.prompts import PROMPT_IDENTIFY_FIRST_NUMBERED_SECTION, PROMPT_METADATA_EXTRACTION, PROMPT_CONTRACT_SUMMARY, PROMPT_SECTION_RELEVANCE, PROMPT_CONTRACT_CLAUSE
from app.utils.embeddings import get_section_embeddings
from app.utils.common import string_truncate

logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

###################################
# PDF/DOCX TO MARKDOWN CONVERSION #
###################################

def clean_contract_markdown(contract_markdown: str) -> str:
    """perform a series of clean-up steps on the raw converted markdown text"""

    # remove unknown and image tags
    contract_markdown = re.sub(r"<unknown>", "", contract_markdown)
    contract_markdown = re.sub(r"<!-- image -->", "", contract_markdown)

    # remove electronic signature placeholders and glyph encoding artifacts
    contract_markdown = re.sub(r'\{\{[^}]*\}\}', '', contract_markdown)
    contract_markdown = re.sub(r'GLYPH<[^>]*>', '', contract_markdown)
    contract_markdown = re.sub(r'GLYPH&lt;[^&]*&gt;', '', contract_markdown)

    # remove all non-ASCII characters
    contract_markdown = re.sub(r'[^\x00-\x7F]+', '', contract_markdown)

    # return the cleaned markdown text
    return contract_markdown.strip()


async def parse_contract_markdown(path: str) -> str:
    """convert a PDF/DOCX contract into a markdown string"""

    # parse the PDF contract as a DoclingDocument
    converter = DocumentConverter(allowed_formats=["pdf", "docx"])
    conversion_result = await asyncio.to_thread(converter.convert, source=path)

    # convert the document to a single markdown string inserting image and page break placeholders as HTML comments
    contract_markdown = conversion_result.document.export_to_markdown(
        image_mode="placeholder",
        image_placeholder="<!-- image -->",
        page_break_placeholder="<!-- pagebreak -->"
    )

    # perform a series of clean-up steps on the raw converted markdown text
    contract_markdown = clean_contract_markdown(contract_markdown)
    return contract_markdown

#################################
# STRUCTURED SECTION EXTRACTION #
#################################

async def identify_first_section_line(contract_markdown: str) -> str:
    """identify the first numbered section in the contract text to determine the start of the main body"""

    openai = AsyncOpenAI()
    truncated_markdown = string_truncate(contract_markdown, max_tokens=4096)

    response: Response = await openai.responses.create(
        model="gpt-4.1-mini",
        instructions=PROMPT_IDENTIFY_FIRST_NUMBERED_SECTION,
        input=truncated_markdown,
        temperature=0.0,
        timeout=60
    )
    first_section_line = re.sub(r"^\s*[-#]*\s*", "", response.output_text).strip()
    # NOTE: normalize lines by removing leading whitespace and markdown header/list markers

    logger.info(f"first_section_line: {first_section_line}")
    return first_section_line


def split_contract_lines(contract_markdown: str) -> list[str]:
    """split the cleaned contract markdown text into individual lines for further processing"""

    contract_lines = contract_markdown.split("\n")
    contract_lines = [re.sub(r"^\s*[-#]*\s*", "", line).strip() for line in contract_lines]
    contract_lines = [re.sub(r"\s+", " ", line).strip() for line in contract_lines]
    # NOTE: normalize lines by removing leading whitespace, removing markdown header/list markers, and collapsing multiple spaces into a single space

    contract_lines = [line for line in contract_lines if line.strip()]
    return contract_lines


def parse_leaf_sections(contract_lines: list[str], first_section_line: str, line_separator: str = " ") -> list[ParsedContractSection]:
    """parse the contract lines into lowest-level (leaf) section objects"""

    # initialize the list of leaf sections to parse and the current page to keep track of section page boundaries
    leaf_sections: list[ParsedContractSection] = []
    current_page = 1

    # initialize the current section as the "preamble" - all contracttext before the first numbered section
    current_section = ParsedContractSection(type=ContractSectionType.PREAMBLE, level=1, number="0", name="PREAMBLE", markdown="", beg_page=current_page, end_page=current_page)
    current_section_lines = []
    current_section_prefix = ""
    preamble = True

    # define regular expressions to match new body/appendix sections and extract section numbers/names with capture groups
    body_regex = re.compile(r"^(?:ARTICLE|SECTION)?\s*(\d+(\.\d+)*[A-Za-z]?)(?:\.|:)?(?:\s+(.+))?$", re.IGNORECASE)
    appendix_regex = re.compile(r"^(APPENDIX|ATTACHMENT|EXHIBIT|ANNEXURE|SCHEDULE)\s+(\w+)(?:\s+(.+))?$", re.IGNORECASE)
    page_break_text = "<!-- pagebreak -->"

    for line in contract_lines:

        # begin to parse the main body + appendices after the first section line
        if preamble and line == first_section_line:
            logger.info("detected first section line - closing preamble section and parsing numbered body/appendix sections")
            preamble = False

        # close the current section and start a new appendix section
        if (appendix_match := appendix_regex.match(line)) and not preamble:
            current_section.markdown = line_separator.join(current_section_lines).strip()
            current_section.end_page = current_page
            leaf_sections.append(current_section)
            appendix_section_type = appendix_match.group(1).lower()
            current_section_prefix = appendix_section_type[0].upper() + appendix_match.group(2)
            section_number = current_section_prefix
            section_name = appendix_match.group(3) or ""
            current_section = ParsedContractSection(type=ContractSectionType.APPENDIX, level=1, number=section_number, name=section_name, markdown="", beg_page=current_page, end_page=current_page)
            current_section_lines = [line]

        # close the current section and start a new body section
        elif (body_match := body_regex.match(line)) and not preamble:
            current_section.markdown = line_separator.join(current_section_lines).strip()
            current_section.end_page = current_page
            leaf_sections.append(current_section)
            if current_section_prefix and current_section_prefix[0] in ["A", "E", "S"]:
                section_type = ContractSectionType.APPENDIX
            else:
                section_type = ContractSectionType.BODY
            section_number = current_section_prefix + "." + body_match.group(1) if current_section_prefix else body_match.group(1)
            section_level = section_number.count(".") + 1
            section_name = body_match.group(3) or ""
            current_section = ParsedContractSection(type=section_type, level=section_level, number=section_number, name=section_name, markdown="", beg_page=current_page, end_page=current_page)
            current_section_lines = [line]

        # increment the current page number and then discard the page brake placeholder line
        elif line.strip() == page_break_text:
            current_page += 1

        # append all regular text lines to the current section
        else:
            current_section_lines.append(line)

    # close the final section after parsing all lines
    current_section.markdown = line_separator.join(current_section_lines).strip()
    current_section.end_page = current_page
    leaf_sections.append(current_section)

    # discard duplicate section numbers - these are usually the result of parsing errors
    unique_section_numbers, unique_leaf_sections = set(), []
    for section in leaf_sections:
        if section.number in unique_section_numbers:
            continue
        else:
            unique_section_numbers.add(section.number)
            unique_leaf_sections.append(section)

    # return the full list of unique leaf sections
    return unique_leaf_sections


def get_section_list(leaf_sections: list[ParsedContractSection], target_level: int = 1, line_separator: str = "\n") -> list[ParsedContractSection]:
    """combine leaf sections at the desired section level by joining all sub-sections until the next sibling/parent section"""

    # initialize the list of combined sections to parse
    merged_sections: list[ParsedContractSection] = []
    current_section = None
    current_section_lines = []

    for section in leaf_sections:
        if section.level < target_level:
            # lower-level section: close the current merged section but do not start a new merged section
            if current_section:
                current_section.markdown = line_separator.join(current_section_lines).strip()
                merged_sections.append(current_section)
            current_section = None
            current_section_lines = []
        elif section.level == target_level:
            # target-level section: close the current merged section and start a new merged section
            if current_section:
                current_section.markdown = line_separator.join(current_section_lines).strip()
                merged_sections.append(current_section)
            current_section = section.model_copy()
            current_section_lines = [section.markdown]
        else:
            # higher-level section: add the sub-section to the current merged section and update the page range of the merged section
            current_section_lines.append(section.markdown)
            if current_section:
                current_section.end_page = max(current_section.end_page, section.end_page)

    # close the last combined section
    if current_section:
        current_section.markdown = line_separator.join(current_section_lines).strip()
        current_section.end_page = max(current_section.end_page, section.end_page)
        merged_sections.append(current_section)

    # return the full list of combined sections
    return merged_sections


def get_section_tree(leaf_sections: list[ParsedContractSection]) -> ContractSectionNode:
    """parse the leaf sections into a hierarchical tree of parent/child section nodes"""

    # convert all parsed sections to ContractSectionNode objects
    nodes_by_number = {
        section.number: ContractSectionNode(
            id=section.number,
            type=section.type,
            level=section.level,
            number=section.number,
            name=section.name,
            markdown=section.markdown,
            parent_id=None,
            children=[]
        )
        for section in leaf_sections
    }

    # build parent-child relationships for all non-top-level sections
    for section in leaf_sections:
        node = nodes_by_number[section.number]
        if section.level == 1:
            parent_number = None
        else:
            parent_number = ".".join(section.number.split(".")[:-1])
        if parent_number and parent_number in nodes_by_number:
            parent_node = nodes_by_number[parent_number]
            node.parent_id = parent_number
            parent_node.children.append(node)

    # create the artificial root node (level=0) of the contract
    root_node = ContractSectionNode(id="root", type=ContractSectionType.ROOT, level=0, number="root", name="Contract", markdown="")

    # add the top-level sections as children of the artificial root node
    top_level_nodes = [node for node in nodes_by_number.values() if node.level == 1]
    for node in top_level_nodes:
        node.parent_id = "root"
        root_node.children.append(node)

    # return the full section tree under the artificial root node with all parent-child relationships defined
    return root_node


async def add_section_embeddings(sections: list[ParsedContractSection]) -> list[ParsedContractSection]:
    """add embedding vectors to the structured contract sections"""

    # generate vector embeddings for all named sections (valid section names are typically less than 10 words)
    named_sections = [section for section in sections if 1 <= len(section.name.split()) <= 10]
    named_section_embeddings = await get_section_embeddings(sections=named_sections)
    for section, embedding in zip(named_sections, named_section_embeddings):
        if embedding:
            section.embedding = embedding
    return sections


async def parse_contract_sections(contract_markdown: str) -> tuple[list[ParsedContractSection], ContractSectionNode]:
    """parse the contract markdown text into structured section objects at multiple levels of granularity"""

    # parse the contract into lowest-level atomic (leaf) sections
    contract_lines = split_contract_lines(contract_markdown)
    first_section_line = await identify_first_section_line(contract_markdown)
    leaf_sections = parse_leaf_sections(contract_lines, first_section_line)

    # parse the leaf sections into a flat list of sections at all levels of granularity
    max_level = max(section.level for section in leaf_sections)
    section_lists = [get_section_list(leaf_sections, level) for level in range(1, max_level + 1)]
    flat_section_list = [section for level_sections in section_lists for section in level_sections]
    embedded_flat_section_list = await add_section_embeddings(sections=flat_section_list)

    # parse the leaf sections into a hierarchical tree of parent/child section nodes
    section_tree = get_section_tree(leaf_sections)

    # return the parsed and embedded structured contract sections
    return embedded_flat_section_list, section_tree

# ##############################
# CONTRACT METADATA EXTRACTION #
################################

async def extract_contract_structured_metadata(contract_markdown: str) -> ContractStructuredMetadata:
    """extract structured contract-level metadata from the parsed markdown text"""

    openai = AsyncOpenAI()
    response: ParsedResponse = await openai.responses.parse(
        model="gpt-4.1-mini",
        instructions=PROMPT_METADATA_EXTRACTION,
        input=contract_markdown,
        text_format=ContractStructuredMetadata,
        temperature=0.0,
        timeout=60
    )
    result: ContractStructuredMetadata = response.output_parsed
    logger.info(f"extracted contract structured metadata: {result.model_dump()}")
    return result

async def extract_contract_summary(contract_markdown: str) -> str:
    """extract a concise summary of the contract text"""

    openai = AsyncOpenAI()
    response: Response = await openai.responses.create(
        model="gpt-4.1-mini",
        instructions=PROMPT_CONTRACT_SUMMARY,
        input=contract_markdown,
        temperature=0.0,
        timeout=60
    )
    result = response.output_text
    logger.info(f"extracted contract summary: {result}")
    return result

##############################
# STANDARD CLAUSE EXTRACTION #
##############################

async def get_clause_section_candidates(db: AsyncSession, clause: StandardClause, contract_id: UUID, k: int = 10) -> list[ContractSection]:
    """get the best-matching contract sections using embedding similarity"""

    if clause.embedding is None:
        return []

    statement = (
        select(ContractSection)
        .where(ContractSection.contract_id == contract_id)
        .where(ContractSection.embedding.is_not(None))
        .order_by(ContractSection.embedding.cosine_distance(clause.embedding))
        .limit(k)
    )

    result = await db.execute(statement)
    return result.scalars().all()


async def evaluate_clause_section_relevance(contract_summary: str, clause: StandardClause, section: ContractSection) -> SectionRelevanceEvaluation:
    """evaluate the relevance of a single contract section wrt a standard clause"""

    openai = AsyncOpenAI()
    standard_clause_text = f"Name: {clause.display_name}\nDescription: {clause.description}"
    input_section_text = section.markdown

    response: ParsedResponse = await openai.responses.parse(
        model="gpt-4.1-mini",
        input=PROMPT_SECTION_RELEVANCE.format(contract_summary=contract_summary, standard_clause=standard_clause_text, contract_section=input_section_text),
        text_format=SectionRelevanceEvaluation,
        temperature=0.0,
        timeout=60
    )
    result: SectionRelevanceEvaluation = response.output_parsed

    logger.info(f"relevance evaluation: clause={clause.name} section={section.number} {section.name} result={result.model_dump()}")
    return result


async def evaluate_clause_section_candidates(contract_summary: str, clause: StandardClause, sections: list[ContractSection]) -> list[ContractSection]:
    """determine which of the candidate sections are relevant to the standard clause using LLM classification"""

    evaluation_results = await asyncio.gather(*[evaluate_clause_section_relevance(contract_summary, clause, section) for section in sections])
    matching_sections = [section for section, result in zip(sections, evaluation_results) if result.match]

    logger.info(f"{len(matching_sections)} matching sections identified for clause={clause.name}")
    return matching_sections


async def extract_contract_clause(db: AsyncSession, contract: Contract, clause: StandardClause) -> ContractClause:
    """assemble a contract-specific standard clause based on the relevant contract sections"""

    # identify the subset of relevant sections for the clause using embedding similarity -> LLM classification
    candidate_sections = await get_clause_section_candidates(db=db, clause=clause, contract_id=contract.id)
    matching_sections = await evaluate_clause_section_candidates(contract_summary=contract.meta["summary"], clause=clause, sections=candidate_sections)
    if not matching_sections:
        logger.warning(f"no matching input sections found for clause={clause.name} - skipping contract-specific clause extraction")
        return None

    # extract the clause raw text: appended relevant sections ordered by section number
    raw_markdown = "\n".join([section.markdown for section in sorted(matching_sections, key=lambda x: x.number)])

    # extract the clause cleaned text: LLM-synthesized summary from the raw text
    openai = AsyncOpenAI()
    response: Response = await openai.responses.create(
        model="gpt-4.1-mini",
        input=PROMPT_CONTRACT_CLAUSE.format(
            standard_clause=f"Name: {clause.display_name}\nDescription: {clause.description}",
            contract_sections=raw_markdown
        ),
        temperature=0.0,
        timeout=60
    )
    cleaned_markdown = response.output_text

    # create the contract clause object and return
    contract_clause = ContractClause(
        standard_clause_id=clause.id,
        contract_id=contract.id,
        contract_sections=[section.id for section in matching_sections],
        raw_markdown=raw_markdown,
        cleaned_markdown=cleaned_markdown
    )
    return contract_clause

###################################
# HIGHER-LEVEL WORKFLOW FUNCTIONS #
###################################

async def parse_contract(path: str) -> ParsedContract:
    """parse a PDF/DOCX contract into a markdown string and list of structured section objects"""

    logger.info("converting PDF/DOCX contract to markdown text...")
    contract_markdown = await parse_contract_markdown(path)

    logger.info("parsing contract sections as structured objects...")
    section_list, section_tree = await parse_contract_sections(contract_markdown)

    logger.info("extracting contract metadata and summary...")
    structured_metadata, contract_summary = await asyncio.gather(
        extract_contract_structured_metadata(contract_markdown), 
        extract_contract_summary(contract_markdown)
    )
    contract_metadata = ContractMetadata(**structured_metadata.model_dump(), summary=contract_summary)

    contract = ParsedContract(
        filename=os.path.basename(path),
        markdown=contract_markdown,
        metadata=contract_metadata,
        section_list=section_list,
        section_tree=section_tree,
    )
    return contract


async def extract_clauses(db: AsyncSession, contract: Contract, standard_clauses: list[StandardClause]) -> list[ContractClause]:
    """extract all standard clauses from the input contract"""

    contract_clauses: list[ContractClause] = []
    for clause in standard_clauses:
        logger.info(f"*** extracting standard clause: {clause.name} ***")
        contract_clause = await extract_contract_clause(db, contract, clause)
        if contract_clause:
            contract_clauses.append(contract_clause)
    return contract_clauses

##############################################################
# EXECUTABLE ENTRYPOINT TO RUN WORKFLOW AS STANDALONE SCRIPT #
##############################################################

async def main():
    """run the contract parsing workflow as an executable script"""

    import dotenv
    dotenv.load_dotenv()

    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract_path", type=str, help="local filepath of the PDF contract document to process")
    args = parser.parse_args()

    parsed_contract = await parse_contract(args.contract_path)
    for section in parsed_contract.section_list:
        section.embedding = None

    output_folder = "../sample_output"
    output_prefix = os.path.splitext(os.path.split(args.contract_path)[1])[0]

    os.makedirs(output_folder, exist_ok=True)
    with open(f"{output_folder}/{output_prefix}.md", "w") as f:
        f.write(parsed_contract.markdown)
    with open(f"{output_folder}/{output_prefix}.json", "w") as f:
        f.write(parsed_contract.model_dump_json(indent=2))


if __name__ == "__main__":
    # uv run -m app.features.workflows.ingestion --contract_path="../sample_contracts/contract.pdf"
    asyncio.run(main())
