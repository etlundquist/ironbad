export interface ContractMetadata {
  document_type: "Master Agreement" | "Statement of Work" | "Purchase Order" | "Other"
  document_title?: string
  customer_name?: string
  supplier_name?: string
  effective_date?: string
  initial_term?: string
}

export interface Contract {
  id: string
  status: string
  filename: string
  filetype: string
  meta?: ContractMetadata
  created_at: string
  updated_at: string
}

export interface ContractSectionCitation {
  section_id: string
  section_number: string
  section_name?: string
  beg_page?: number
  end_page?: number
}

