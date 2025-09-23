import os
import re
import logging
import asyncio
import dotenv

from docling.document_converter import DocumentConverter

from app.models import ParsedContract, ParsedContractSection
from app.enums import ContractSectionType

dotenv.load_dotenv()
logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


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


def split_contract_lines(contract_markdown: str) -> list[str]:
    """split the cleaned contract markdown text into individual lines for further processing"""

    contract_lines = contract_markdown.split("\n")
    contract_lines = [re.sub(r"^\s*[-#]*\s*", "", line).strip() for line in contract_lines]
    # NOTE: normalize lines by removing leading whitespace and markdown header/list markers

    contract_lines = [line for line in contract_lines if line.strip()]
    return contract_lines


def parse_leaf_sections(contract_lines: list[str], line_separator: str = " ") -> list[ParsedContractSection]:
    """parse the contract lines into lowest-level (leaf) section objects"""

    # initialize the list of leaf sections to parse and the running current page to keep track of section page boundaries
    leaf_sections: list[ParsedContractSection] = []
    current_page = 1

    # initialize the current section as the "preamble" all text before the first numbered section
    current_section = ParsedContractSection(type=ContractSectionType.PREAMBLE, level=1, number="0", name="PREAMBLE", markdown="", beg_page=current_page, end_page=current_page)
    current_section_lines = []
    current_section_prefix = ""

    # define regular expressions to match new body/appendix sections and extract section numbers/names with capture groups
    body_regex = re.compile(r"^(?:ARTICLE|SECTION)?\s*(\d+(\.\d+)*)(?:\.)?(?:\s+(.+))?$", re.IGNORECASE)
    appendix_regex = re.compile(r"^(ATTACHMENT|EXHIBIT|SCHEDULE)\s+(\w+)(?:\s+(.+))?$", re.IGNORECASE)
    page_break_text = "<!-- pagebreak -->"

    for line in contract_lines:
        if appendix_match := appendix_regex.match(line):
            # close the current section: join all lines and update the ending page number
            current_section.markdown = line_separator.join(current_section_lines).strip()
            current_section.end_page = current_page
            leaf_sections.append(current_section)
            # start a new appendix section: prefix the section number with the first letter of the appendix type to disambiguate from body sections
            appendix_section_type = appendix_match.group(1).lower()
            current_section_prefix = appendix_section_type[0].upper() + appendix_match.group(2)
            section_number = current_section_prefix
            section_name = appendix_match.group(3) or ""
            current_section = ParsedContractSection(type=ContractSectionType.APPENDIX, level=1, number=section_number, name=section_name, markdown="", beg_page=current_page, end_page=current_page)
            current_section_lines = [line]
        elif body_match := body_regex.match(line):
            # close the current section: join all lines and update the ending page number
            current_section.markdown = line_separator.join(current_section_lines).strip()
            current_section.end_page = current_page
            leaf_sections.append(current_section)
            # determine the new section type based on the current section prefix (only appendix sections have a prefix)
            if current_section_prefix and current_section_prefix[0] in ["A", "E", "S"]:
                section_type = ContractSectionType.APPENDIX
            else:
                section_type = ContractSectionType.BODY
            # initialize a new section: the current section prefix is used to disambiguate between body and appendix sections
            section_number = current_section_prefix + "." + body_match.group(1) if current_section_prefix else body_match.group(1)
            section_level = section_number.count(".") + 1
            section_name = body_match.group(3) or ""
            current_section = ParsedContractSection(type=section_type, level=section_level, number=section_number, name=section_name, markdown="", beg_page=current_page, end_page=current_page)
            current_section_lines = [line]
        elif line.strip() == page_break_text:
            # increment the current page number and then discard the page brake placeholder line
            current_page += 1
        else:
            # add the line to the current section if the line is not the start of a new section or a page break placeholder
            current_section_lines.append(line)

    # close the final section and return the full list of leaf sections
    current_section.markdown = line_separator.join(current_section_lines).strip()
    current_section.end_page = current_page
    leaf_sections.append(current_section)
    return leaf_sections


def combine_leaf_sections(leaf_sections: list[ParsedContractSection], target_level: int = 1, line_separator: str = "\n") -> list[ParsedContractSection]:
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


def parse_contract_sections(contract_markdown: str) -> list[ParsedContractSection]:
    """parse the contract markdown text into structured section objects at multiple levels of granularity"""

    # parse the contract into lowest-level atomic (leaf) sections
    contract_lines = split_contract_lines(contract_markdown)
    leaf_sections = parse_leaf_sections(contract_lines)

    # combine leaf sections at the desired level to form higher-level sections
    max_level = max(section.level for section in leaf_sections)
    combined_sections = [combine_leaf_sections(leaf_sections, level) for level in range(1, max_level + 1)]

    # flatten the list of combined sections into a single list of sections at all levels of granularity
    flattened_sections = [section for level_sections in combined_sections for section in level_sections]
    return flattened_sections


async def parse_contract(path: str) -> ParsedContract:
    """parse a PDF/DOCX contract into a markdown string and list of structured section objects"""

    logger.info("converting PDF/DOCX contract to markdown text...")
    contract_markdown = await parse_contract_markdown(path)

    logger.info("parsing contract sections as structured objects...")
    contract_sections = parse_contract_sections(contract_markdown)

    contract = ParsedContract(filename=os.path.basename(path), markdown=contract_markdown, sections=contract_sections)
    return contract


async def main():
    """run the contract parsing workflow as an executable script"""

    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract_path", type=str, help="local filepath of the PDF contract document to process")
    args = parser.parse_args()

    parsed_contract = await parse_contract(args.contract_path)
    output_prefix = os.path.splitext(os.path.split(args.contract_path)[1])[0]

    output_folder = "../sample_output"
    os.makedirs(output_folder, exist_ok=True)
    with open(f"{output_folder}/{output_prefix}.md", "w") as f:
        f.write(parsed_contract.markdown)
    with open(f"{output_folder}/{output_prefix}.json", "w") as f:
        f.write(parsed_contract.model_dump_json(indent=2))


if __name__ == "__main__":
    # python -m app.ingestion --contract_path="../sample_input/contract.pdf"
    asyncio.run(main())

