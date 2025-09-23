PROMPT_CLEAN_MARKDOWN = """
You are presented with markdown text parsed from a single page of a PDF legal contract.
You task is to clean the parsed markdown text to prepare the document for further processing.
Clean the markdown text by applying the following rules:

- convert all sections to the following format: "## <section_number> <section_name>\n<section_text>"
    - <section_number> is the section number exactly as it appears in the contract text
    - <section_name> is the section name (if present) following the section number on the same line
    - <section_text> is the section body text following the section number/name until the next section number/name
    - the section number may be alphanumeric and/or hierarchical (e.g. "1.1", "2.3.4", "A.1", "B.2.3")
    - some sections do not have section names - in these cases omit the <section_name> from the output
    - all section numbers must be appear on a separate line with "##" markdown headers
    - the section text must be output on subsequent lines following the section number/name
- convert all exhibit, schedule, attachment, etc. appendix headers to the following format: "## <appendix_type> <appendix_number> <appendix_name>"
    - <appendix_type> is the type of the appendix header (e.g. "EXHIBIT", "SCHEDULE", "ATTACHMENT", etc.) exactly as it appears in the contract text
    - <appendix_number> is the number of the appendix header exactly as it appears in the contract text
    - <appendix_name> is the name of the appendix header exactly as it appears following the appendix number on the same line
    - every appendix header should have a <appendix_type> and <appendix_number> but not all headers have a <appendix_name>
    - any appendix text that appears after the appendix type/number/name on the same line should be moved to the next line
- only lines with section headers should have "##" markdown headers - all other lines should be regular text
""".strip()
