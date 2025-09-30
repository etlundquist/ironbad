import { NextPage } from 'next'
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'

// Dynamically import react-pdf to avoid SSR issues
const Document = dynamic(() => import('react-pdf').then(mod => mod.Document), { ssr: false })
const Page = dynamic(() => import('react-pdf').then(mod => mod.Page), { ssr: false })

// CSS will be imported by Next.js automatically

interface Contract {
  id: string
  status: string
  filename: string
  filetype: string
  meta?: ContractMetadata
  created_at: string
  updated_at: string
}

interface ContractMetadata {
  document_type: "Master Agreement" | "Statement of Work" | "Purchase Order" | "Other"
  document_title?: string
  customer_name?: string
  supplier_name?: string
  effective_date?: string
  initial_term?: string
}

interface StandardClause {
  id: string
  name: string
  display_name: string
  description: string
  standard_text: string
  created_at: string
  updated_at: string
}

interface ContractClause {
  id: string
  standard_clause_id: string
  standard_clause?: StandardClause
  contract_id: string
  contract_sections: string[]
  raw_markdown: string
  cleaned_markdown: string
  created_at: string
  updated_at: string
}

interface StandardClauseRule {
  id: string
  standard_clause_id: string
  severity: "Low" | "Medium" | "High" | "Critical"
  title: string
  text: string
  created_at: string
  updated_at: string
}

interface ContractIssue {
  id: string
  standard_clause_id: string
  standard_clause_rule_id: string
  standard_clause?: StandardClause
  standard_clause_rule?: StandardClauseRule
  contract_id: string
  explanation: string
  citations?: ContractSectionCitation[]
  status: "Open" | "Resolved"
  resolution?: "Ignored" | "Revised"
  ai_suggested_revision?: string
  user_suggested_revision?: string
  active_suggested_revision?: string
  created_at: string
  updated_at: string
}

interface ContractSectionCitation {
  section_id: string
  section_number: string
  section_name?: string
  beg_page?: number
  end_page?: number
}

// Chat types matching backend schemas
type ChatMessageStatus = 'pending' | 'in_progress' | 'completed' | 'failed'
type ChatMessageRole = 'system' | 'user' | 'assistant'

interface ChatThread {
  id: string
  contract_id: string
  archived: boolean
  created_at: string
  updated_at: string
}

interface ChatMessage {
  id: string
  chat_thread_id: string
  parent_chat_message_id?: string | null
  status: ChatMessageStatus
  role: ChatMessageRole
  content: string
  citations?: ContractSectionCitation[]
  created_at: string
  updated_at: string
}

interface ChatMessageStatusUpdate {
  chat_thread_id: string
  chat_message_id: string
  status: ChatMessageStatus
}

interface ChatMessageTokenDelta {
  chat_message_id: string
  delta: string
}

const ContractDetailPage: NextPage = () => {
  const router = useRouter()
  const { id, tab } = router.query
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('metadata')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pdfLoading, setPdfLoading] = useState(false)

  // Track current page for programmatic navigation
  const [currentPage, setCurrentPage] = useState(1)
  const [isClient, setIsClient] = useState(false)

  // PDF viewer controls
  const [zoomLevel, setZoomLevel] = useState(100)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)

  // Metadata form state
  const [metadata, setMetadata] = useState<ContractMetadata>({
    document_type: "Master Agreement",
    document_title: "",
    customer_name: "",
    supplier_name: "",
    effective_date: "",
    initial_term: ""
  })
  const [originalMetadata, setOriginalMetadata] = useState<ContractMetadata | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Clauses data state
  const [standardClauses, setStandardClauses] = useState<StandardClause[]>([])
  const [contractClauses, setContractClauses] = useState<ContractClause[]>([])
  const [clausesLoading, setClausesLoading] = useState(false)
  const [expandedClause, setExpandedClause] = useState<string | null>(null)

  // Issues data state
  const [contractIssues, setContractIssues] = useState<ContractIssue[]>([])
  const [issuesLoading, setIssuesLoading] = useState(false)
  const [expandedIssueClause, setExpandedIssueClause] = useState<string | null>(null)
  const [hoveredIssueId, setHoveredIssueId] = useState<string | null>(null)

  // Chat state
  const [currentChatThread, setCurrentChatThread] = useState<ChatThread | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const chatAbortControllerRef = useRef<AbortController | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const sortMessagesByTime = (messages: ChatMessage[]) => {
    return [...messages].sort((a, b) => {
      const ta = new Date(a.created_at).getTime()
      const tb = new Date(b.created_at).getTime()
      if (ta !== tb) return ta - tb
      // Stable tie-breaker: user before assistant
      if (a.role !== b.role) return a.role === 'user' ? -1 : 1
      return a.id.localeCompare(b.id)
    })
  }

  useEffect(() => {
    setIsClient(true)
    if (typeof tab === 'string' && ['metadata','clauses','issues','chat'].includes(tab)) {
      setActiveTab(tab)
    }
    if (id) {
      fetchContract()
    }
  }, [id, tab])

  // Fetch clauses data when clauses tab is active
  useEffect(() => {
    if (activeTab === 'clauses' && id && standardClauses.length === 0) {
      fetchClausesData()
    }
  }, [activeTab, id, standardClauses.length])

  // Fetch issues data when issues tab is active
  useEffect(() => {
    if (activeTab === 'issues' && id && contractIssues.length === 0) {
      fetchIssuesData()
    }
  }, [activeTab, id, contractIssues.length])

  // Fetch chat current thread and messages when chat tab becomes active
  useEffect(() => {
    const initializeChat = async () => {
      if (!id || activeTab !== 'chat') return
      await fetchCurrentChatThreadAndMessages()
    }
    initializeChat()
    // Cleanup on tab switch: abort any in-flight stream
    return () => {
      if (activeTab !== 'chat' && chatAbortControllerRef.current) {
        chatAbortControllerRef.current.abort()
        chatAbortControllerRef.current = null
      }
    }
  }, [activeTab, id])

  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeTab, chatMessages.length])

  // Set up PDF.js worker on client side; pin worker to the exact API version
  useEffect(() => {
    if (isClient && typeof window !== 'undefined') {
      import('react-pdf').then(({ pdfjs }) => {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
      }).catch(() => {})
    }
  }, [isClient])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPdfLoading(false)
  }

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error)
    setPdfLoading(false)
  }

  const fetchContract = async () => {
    try {
      setLoading(true)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts/${id}`)

      if (!response.ok) {
        throw new Error('Failed to fetch contract')
      }

      const data = await response.json()
      setContract(data)

      // Initialize metadata form
      if (data.meta) {
        setMetadata(data.meta)
        setOriginalMetadata(data.meta)
      } else {
        // Set default values if no metadata exists
        const defaultMetadata: ContractMetadata = {
          document_type: "Master Agreement",
          document_title: "",
          customer_name: "",
          supplier_name: "",
          effective_date: "",
          initial_term: ""
        }
        setMetadata(defaultMetadata)
        setOriginalMetadata(defaultMetadata)
      }

      // Set up PDF URL for react-pdf
      if (data.filetype === 'application/pdf') {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
        setPdfUrl(`${backendUrl}/contracts/${id}/contents`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const fetchClausesData = async () => {
    if (!id) return

    try {
      setClausesLoading(true)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

      // Fetch both standard clauses and contract clauses in parallel
      const [standardClausesResponse, contractClausesResponse] = await Promise.all([
        fetch(`${backendUrl}/standard_clauses`),
        fetch(`${backendUrl}/contracts/${id}/clauses`)
      ])

      if (standardClausesResponse.ok && contractClausesResponse.ok) {
        const [standardClausesData, contractClausesData] = await Promise.all([
          standardClausesResponse.json(),
          contractClausesResponse.json()
        ])

        setStandardClauses(standardClausesData)
        setContractClauses(contractClausesData)
      } else {
        console.error('Failed to fetch clauses data')
      }
    } catch (err) {
      console.error('Error fetching clauses data:', err)
    } finally {
      setClausesLoading(false)
    }
  }

  const fetchIssuesData = async () => {
    if (!id) return

    try {
      setIssuesLoading(true)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

      const response = await fetch(`${backendUrl}/contracts/${id}/issues`)

      if (response.ok) {
        const issuesData = await response.json()
        setContractIssues(issuesData)
      } else {
        console.error('Failed to fetch issues data')
      }
    } catch (err) {
      console.error('Error fetching issues data:', err)
    } finally {
      setIssuesLoading(false)
    }
  }

  // Functions for future PDF interaction features
  const navigateToPage = (page: number) => {
    if (!numPages) return
    const next = Math.min(Math.max(1, page), numPages)
    const anchor = document.getElementById(`pdf-page-${next}`)
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setPageNumber(next)
    setCurrentPage(next)
  }

  const highlightText = (text: string, pageNumber?: number) => {
    // Placeholder: in a future step, implement text measurement and overlays
    if (typeof pageNumber === 'number') navigateToPage(pageNumber)
    console.log('Highlight requested for text:', text, 'on page:', pageNumber)
  }

  const searchInPDF = (text: string) => {
    setSearchText(text)
    if (text.trim()) {
      performSearch(text)
    } else {
      setSearchResults([])
      setCurrentSearchIndex(0)
    }
  }

  const performSearch = async (text: string) => {
    setIsSearching(true)
    try {
      // Clear previous highlights
      clearHighlights()

      // Simple text search implementation
      const results = []
      const searchTerm = text.toLowerCase()

      // Search through all pages
      for (let i = 1; i <= (numPages || 0); i++) {
        const pageElement = document.getElementById(`pdf-page-${i}`)
        if (pageElement) {
          const textContent = pageElement.textContent?.toLowerCase() || ''
          if (textContent.includes(searchTerm)) {
            results.push({ page: i, text: text })
            highlightTextInPage(pageElement, text, i === 1 ? 0 : -1) // Highlight first page immediately
          }
        }
      }

      setSearchResults(results)
      setCurrentSearchIndex(0)

      // Navigate to first result
      if (results.length > 0) {
        navigateToPage(results[0].page)
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsSearching(false)
    }
  }

  const highlightTextInPage = (pageElement: HTMLElement, searchText: string, currentIndex: number) => {
    // Wait for PDF to render, then highlight text spans
    setTimeout(() => {
      const textLayer = pageElement.querySelector('.react-pdf__Page__textContent')
      if (!textLayer) return

      const searchTerm = searchText.toLowerCase()
      const fullText = textLayer.textContent || ''

      if (fullText.toLowerCase().includes(searchTerm)) {
        // Get all text spans in order
        const textSpans = Array.from(textLayer.querySelectorAll('span'))
        const textNodes = textSpans.map(span => ({
          element: span,
          text: span.textContent || '',
          startIndex: 0,
          endIndex: 0
        }))

        // Calculate character positions for each span
        let currentPos = 0
        textNodes.forEach(node => {
          node.startIndex = currentPos
          node.endIndex = currentPos + node.text.length
          currentPos += node.text.length
        })

        // Find all matches in the full text
        const regex = new RegExp(`(${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
        let match
        let matchIndex = 0

        while ((match = regex.exec(fullText)) !== null) {
          const matchStart = match.index
          const matchEnd = match.index + match[0].length

          // Find which spans contain this match
          const affectedSpans = textNodes.filter(node =>
            node.startIndex < matchEnd && node.endIndex > matchStart
          )

          if (affectedSpans.length > 0) {
            // Handle single span match
            if (affectedSpans.length === 1) {
              const span = affectedSpans[0]
              const relativeStart = Math.max(0, matchStart - span.startIndex)
              const relativeEnd = Math.min(span.text.length, matchEnd - span.startIndex)
              const beforeText = span.text.substring(0, relativeStart)
              const matchText = span.text.substring(relativeStart, relativeEnd)
              const afterText = span.text.substring(relativeEnd)

              const isCurrent = currentIndex >= 0 && matchIndex === currentIndex
              const className = isCurrent ? 'pdf-search-highlight current' : 'pdf-search-highlight'
              const highlightedMatch = `<span class="${className}">${matchText}</span>`

              span.element.innerHTML = beforeText + highlightedMatch + afterText
            } else {
              // Handle multi-span match - highlight the relevant parts of each span
              affectedSpans.forEach((span, spanIndex) => {
                const spanStart = Math.max(0, matchStart - span.startIndex)
                const spanEnd = Math.min(span.text.length, matchEnd - span.startIndex)

                if (spanIndex === 0) {
                  // First span: highlight from match start to end of span
                  const beforeText = span.text.substring(0, spanStart)
                  const matchText = span.text.substring(spanStart)
                  const isCurrent = currentIndex >= 0 && matchIndex === currentIndex
                  const className = isCurrent ? 'pdf-search-highlight current' : 'pdf-search-highlight'
                  span.element.innerHTML = beforeText + `<span class="${className}">${matchText}</span>`
                } else if (spanIndex === affectedSpans.length - 1) {
                  // Last span: highlight from start to match end
                  const matchText = span.text.substring(0, spanEnd)
                  const afterText = span.text.substring(spanEnd)
                  const isCurrent = currentIndex >= 0 && matchIndex === currentIndex
                  const className = isCurrent ? 'pdf-search-highlight current' : 'pdf-search-highlight'
                  span.element.innerHTML = `<span class="${className}">${matchText}</span>` + afterText
                } else {
                  // Middle spans: highlight entire span
                  const isCurrent = currentIndex >= 0 && matchIndex === currentIndex
                  const className = isCurrent ? 'pdf-search-highlight current' : 'pdf-search-highlight'
                  span.element.innerHTML = `<span class="${className}">${span.text}</span>`
                }
              })
            }

            matchIndex++
          }
        }
      }
    }, 200) // Increased delay to ensure PDF is fully rendered
  }

  const getTextNodes = (element: HTMLElement): Text[] => {
    const textNodes: Text[] = []
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    )

    let node
    while (node = walker.nextNode()) {
      if (node.textContent?.trim()) {
        textNodes.push(node as Text)
      }
    }

    return textNodes
  }

  const clearHighlights = () => {
    const highlights = document.querySelectorAll('.pdf-search-highlight')
    highlights.forEach(highlight => {
      highlight.remove()
    })
  }

  const goToNextSearchResult = () => {
    if (searchResults.length > 0) {
      const nextIndex = (currentSearchIndex + 1) % searchResults.length
      setCurrentSearchIndex(nextIndex)
      navigateToPage(searchResults[nextIndex].page)
      updateCurrentHighlight(nextIndex)
    }
  }

  const goToPreviousSearchResult = () => {
    if (searchResults.length > 0) {
      const prevIndex = currentSearchIndex === 0 ? searchResults.length - 1 : currentSearchIndex - 1
      setCurrentSearchIndex(prevIndex)
      navigateToPage(searchResults[prevIndex].page)
      updateCurrentHighlight(prevIndex)
    }
  }

  const updateCurrentHighlight = (newIndex: number) => {
    // Remove current highlighting from all pages
    const currentHighlights = document.querySelectorAll('.pdf-search-highlight.current')
    currentHighlights.forEach(highlight => {
      highlight.classList.remove('current')
    })

    // Add current highlighting to the new page
    if (searchResults[newIndex]) {
      const pageElement = document.getElementById(`pdf-page-${searchResults[newIndex].page}`)
      if (pageElement) {
        const highlights = pageElement.querySelectorAll('.pdf-search-highlight')
        if (highlights.length > 0) {
          highlights[0].classList.add('current')
        }
      }
    }
  }

  const clearSearch = () => {
    setSearchText('')
    setSearchResults([])
    setCurrentSearchIndex(0)
    clearHighlights()
  }

  const handleZoomChange = (newZoom: number) => {
    setZoomLevel(newZoom)
  }

  // Metadata form functions
  const handleMetadataChange = (field: keyof ContractMetadata, value: string) => {
    const newMetadata = { ...metadata, [field]: value }
    setMetadata(newMetadata)

    // Check if there are changes
    const hasChanges = originalMetadata ?
      JSON.stringify(newMetadata) !== JSON.stringify(originalMetadata) :
      Object.values(newMetadata).some(val => val !== "")
    setHasChanges(hasChanges)
  }

  const handleSaveMetadata = async () => {
    if (!contract) return

    setIsSaving(true)
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts/${contract.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      })

      if (response.ok) {
        const updatedContract = await response.json()
        setContract(updatedContract)
        setOriginalMetadata(metadata)
        setHasChanges(false)
        alert('Metadata saved successfully!')
      } else {
        const error = await response.text()
        alert(`Failed to save metadata: ${error}`)
      }
    } catch (error) {
      alert(`Network error: ${error}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Helper functions for clauses display
  const getContractClauseForStandardClause = (standardClauseId: string): ContractClause | undefined => {
    return contractClauses.find(cc => cc.standard_clause_id === standardClauseId)
  }

  const toggleClauseExpansion = (clauseId: string) => {
    setExpandedClause(expandedClause === clauseId ? null : clauseId)
  }

  // Helper functions for issues display
  const getIssuesByStandardClause = () => {
    const grouped: { [key: string]: ContractIssue[] } = {}

    contractIssues.forEach(issue => {
      if (issue.standard_clause) {
        const clauseId = issue.standard_clause.id
        if (!grouped[clauseId]) {
          grouped[clauseId] = []
        }
        grouped[clauseId].push(issue)
      }
    })

    return grouped
  }

  const toggleIssueClauseExpansion = (clauseId: string) => {
    setExpandedIssueClause(expandedIssueClause === clauseId ? null : clauseId)
  }

  const getSeverityLevel = (severity: string): 'info' | 'warning' | 'critical' => {
    const s = (severity || '').toLowerCase()
    if (s === 'critical') return 'critical'
    if (s === 'high' || s === 'medium' || s === 'warning') return 'warning'
    return 'info'
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'Critical':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="severity-icon critical">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        )
      case 'High':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="severity-icon high">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        )
      case 'Medium':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="severity-icon medium">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        )
      case 'Low':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="severity-icon low">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
        )
      default:
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="severity-icon default">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
        )
    }
  }

  // CTA helper functions for each tab
  const getIngestCTA = () => {
    if (!contract) return null

    switch (contract.status) {
      case 'Uploaded':
        return (
          <button className="cta-button primary" onClick={handleIngestContract} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <>
                <div className="spinner small"></div>
                Ingesting...
              </>
            ) : (
              'Ingest Contract'
            )}
          </button>
        )
      case 'Processing':
        return (
          <div className="cta-banner processing">
            <div className="spinner small"></div>
            Contract is currently being ingested
          </div>
        )
      default:
        return null
    }
  }

  const getAnalyzeCTA = () => {
    if (!contract) return null

    switch (contract.status) {
      case 'Ready for Review':
        return (
          <button className="cta-button primary" onClick={handleAnalyzeIssues} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <>
                <div className="spinner small"></div>
                Analyzing...
              </>
            ) : (
              'Analyze Contract'
            )}
          </button>
        )
      case 'Under Review':
        return (
          <button className="cta-button secondary" onClick={() => {/* TODO: Implement complete review */}}>
            Complete Review
          </button>
        )
      case 'Uploaded':
      case 'Processing':
        return (
          <div className="cta-banner info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
            Contracts must be ingested prior to review
          </div>
        )
      default:
        return null
    }
  }

  // Chat helpers
  const fetchCurrentChatThreadAndMessages = async () => {
    if (!id) return
    try {
      setIsChatLoading(true)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      // Try to get current active thread
      const threadResp = await fetch(`${backendUrl}/contracts/${id}/chat/threads/current`)
      if (threadResp.ok) {
        const thread: ChatThread = await threadResp.json()
        setCurrentChatThread(thread)
        const msgsResp = await fetch(`${backendUrl}/contracts/${id}/chat/threads/${thread.id}/messages`)
        if (msgsResp.ok) {
          const msgs: ChatMessage[] = await msgsResp.json()
          setChatMessages(sortMessagesByTime(msgs))
        } else {
          setChatMessages([])
        }
      } else {
        setCurrentChatThread(null)
        setChatMessages([])
      }
    } catch (e) {
      setCurrentChatThread(null)
      setChatMessages([])
    } finally {
      setIsChatLoading(false)
    }
  }

  const archiveCurrentChatThread = async () => {
    if (!id || !currentChatThread) return
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
    await fetch(`${backendUrl}/contracts/${id}/chat/threads/${currentChatThread.id}`, { method: 'PUT' })
  }

  const handleNewChat = async () => {
    // Abort any ongoing stream
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort()
      chatAbortControllerRef.current = null
    }
    // Archive existing thread if present
    try {
      await archiveCurrentChatThread()
    } catch (_) {}
    // Clear FE state; next send will create a thread server-side
    setCurrentChatThread(null)
    setChatMessages([])
  }

  // No placeholder messages; initialization handled by backend 'init' event

  const handleSSEEvent = (eventName: string, data: any) => {
    if (eventName === 'init') {
      const threadId: string = data.chat_thread_id
      const userMsg: ChatMessage = data.user_message
      const assistantMsg: ChatMessage = data.assistant_message
      setCurrentChatThread({ id: threadId, contract_id: contract!.id, archived: false, created_at: userMsg.created_at, updated_at: userMsg.updated_at })
      setChatMessages((prev) => sortMessagesByTime([
        ...prev,
        ...(prev.some((m) => m.id === userMsg.id) ? [] : [userMsg]),
        ...(prev.some((m) => m.id === assistantMsg.id) ? [] : [assistantMsg])
      ]))
      return
    }
    if (eventName === 'user_message') {
      const msg: ChatMessage = data
      setCurrentChatThread((prev) => prev || { id: msg.chat_thread_id, contract_id: contract!.id, archived: false, created_at: msg.created_at, updated_at: msg.updated_at })
      // Append user message; init already provided proper ordering
      setChatMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : sortMessagesByTime([...prev, msg])))
    } else if (eventName === 'message_status_update') {
      const update: ChatMessageStatusUpdate = data
      setChatMessages((prev) => sortMessagesByTime(prev.map((m) => (m.id === update.chat_message_id ? { ...m, status: update.status } : m))))
    } else if (eventName === 'message_token_delta') {
      const delta: ChatMessageTokenDelta = data
      setChatMessages((prev) => sortMessagesByTime(prev.map((m) => (m.id === delta.chat_message_id ? { ...m, content: (m.content || '') + delta.delta, status: m.status === 'pending' ? 'in_progress' : m.status } : m))))
    } else if (eventName === 'assistant_message') {
      const fullMsg: ChatMessage = data
      setChatMessages((prev) => sortMessagesByTime(prev.map((m) => (m.id === fullMsg.id ? fullMsg : m))))
    }
  }

  const parseAndHandleSSEStream = async (response: Response) => {
    const reader = response.body?.getReader()
    if (!reader) {
      console.error('No reader available from response')
      return
    }
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { value, done } = await reader.read()

        if (done) {
          // Process any remaining buffer
          if (buffer.trim()) {
            let sepIndex
            while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
              const rawEvent = buffer.slice(0, sepIndex)
              buffer = buffer.slice(sepIndex + 2)
              const lines = rawEvent.split('\n')
              let eventName = ''
              let dataStr = ''
              for (const line of lines) {
                if (line.startsWith('event:')) eventName = line.slice(6).trim()
                if (line.startsWith('data:')) dataStr += line.slice(5).trim()
              }
              if (eventName && dataStr) {
                try {
                  const parsed = JSON.parse(dataStr)
                  handleSSEEvent(eventName, parsed)
                } catch (e) {
                  console.error('Error parsing SSE data:', e)
                }
              }
            }
          }
          break
        }

        if (!value || value.length === 0) continue

        let chunk = decoder.decode(value, { stream: true })
        // Normalize CRLF to LF to ensure separator detection
        chunk = chunk.replace(/\r\n/g, '\n')
        buffer += chunk

        let sepIndex
        while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex)
          buffer = buffer.slice(sepIndex + 2)
          const lines = rawEvent.split('\n')
          let eventName = ''
          let dataStr = ''
          for (const line of lines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim()
            if (line.startsWith('data:')) dataStr += line.slice(5).trim()
          }
          if (eventName && dataStr) {
            try {
              const parsed = JSON.parse(dataStr)
              handleSSEEvent(eventName, parsed)
            } catch (e) {
              console.error('Error parsing SSE data:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in SSE stream parsing:', error)
      throw error
    }
  }

  const sendChatMessage = async () => {
    if (!contract || !chatInput.trim() || isSendingMessage) return
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
    const url = `${backendUrl}/contracts/${contract.id}/chat/messages`
    const controller = new AbortController()
    chatAbortControllerRef.current = controller
    setIsSendingMessage(true)

    const userMessageContent = chatInput.trim()
    setChatInput('')

    try {
      const payload: any = { content: userMessageContent }
      if (currentChatThread?.id) payload.chat_thread_id = currentChatThread.id

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!resp.ok) {
        alert('Failed to send message')
        return
      }

      if (!resp.body) {
        alert('Failed to send message - no response body')
        return
      }

      // Stream updates will replace placeholders in real-time
      await parseAndHandleSSEStream(resp)
    } catch (e) {
      if ((e as any)?.name !== 'AbortError') {
        alert('Chat request failed')
      }
    } finally {
      setIsSendingMessage(false)
      if (chatAbortControllerRef.current === controller) chatAbortControllerRef.current = null
    }
  }

  const renderAssistantContent = (content: string, citations?: ContractSectionCitation[]) => {
    if (!content) return <span>{content}</span>

    // Component to render markdown with clickable citations
    const MarkdownWithCitations: React.FC<{ children: string }> = ({ children }) => {
      const contentRef = useRef<HTMLDivElement>(null)

      useEffect(() => {
        if (!contentRef.current || !citations) return

        // Find all text nodes and replace citation patterns with buttons
        const walker = document.createTreeWalker(
          contentRef.current,
          NodeFilter.SHOW_TEXT,
          null
        )

        type Replacement = { text?: string; citation?: ContractSectionCitation; sectionNum?: string }
        const nodesToReplace: Array<{ node: Text; replacements: Replacement[] }> = []

        let node: Text | null
        while ((node = walker.nextNode() as Text | null)) {
          if (!node.textContent) continue
          const text = node.textContent
          // Match one or more section numbers separated by commas inside a single bracket
          const regex = /\[([0-9]+(?:\.[0-9]+)*(?:\s*,\s*[0-9]+(?:\.[0-9]+)*)*)\]/g
          let match: RegExpExecArray | null
          let lastIndex = 0
          const replacements: Replacement[] = []
          let hasCitations = false

          while ((match = regex.exec(text)) !== null) {
            hasCitations = true
            if (match.index > lastIndex) {
              replacements.push({ text: text.slice(lastIndex, match.index) })
            }
            const group = match[1]
            const sectionNums = group.split(',').map(s => s.trim()).filter(Boolean)
            if (sectionNums.length > 0) {
              sectionNums.forEach((sectionNum) => {
                const citation = citations.find((c) => c.section_number === sectionNum)
                if (citation && (citation.beg_page !== undefined && citation.beg_page !== null)) {
                  replacements.push({ citation, sectionNum })
                } else {
                  // Fallback to plain text for unknown section numbers
                  replacements.push({ text: `[${sectionNum}]` })
                }
              })
            } else {
              // Fallback to original text if parsing somehow fails
              replacements.push({ text: match[0] })
            }
            lastIndex = regex.lastIndex
          }

          if (hasCitations) {
            if (lastIndex < text.length) {
              replacements.push({ text: text.slice(lastIndex) })
            }
            nodesToReplace.push({ node, replacements })
          }
        }

        // Replace text nodes with spans containing buttons
        nodesToReplace.forEach(({ node, replacements }) => {
          const span = document.createElement('span')
          replacements.forEach((replacement) => {
            if (replacement.text !== undefined) {
              span.appendChild(document.createTextNode(replacement.text))
            } else if (replacement.citation && replacement.sectionNum) {
              const button = document.createElement('button')
              button.type = 'button'
              button.className = 'section-number link inline'
              button.textContent = `[${replacement.sectionNum}]`
              button.title = replacement.citation.section_name || `Section ${replacement.sectionNum}`
              button.onclick = () => navigateToPage(replacement.citation!.beg_page || 1)
              span.appendChild(button)
            }
          })
          node.parentNode?.replaceChild(span, node)
        })
      }, [children, citations])

      return (
        <div ref={contentRef}>
          <ReactMarkdown>{children}</ReactMarkdown>
        </div>
      )
    }

    return <MarkdownWithCitations>{content}</MarkdownWithCitations>
  }

  // Expose functions to parent component for future RHS integration
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).pdfViewerFunctions = {
        navigateToPage,
        highlightText,
        searchInPDF
      }
    }
  }, [])

  const handleIngestContract = async () => {
    if (!contract) return

    setIsAnalyzing(true)
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([contract.id])
      })

      if (response.ok) {
        // Refresh contract to get updated status
        await fetchContract()
        alert('Contract ingestion started successfully!')
      } else {
        const error = await response.text()
        alert(`Failed to start ingestion: ${error}`)
      }
    } catch (error) {
      alert(`Network error: ${error}`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleAnalyzeIssues = async () => {
    if (!contract) return

    setIsAnalyzing(true)
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([contract.id])
      })

      if (response.ok) {
        // Refresh contract data to get updated status
        await fetchContract()
        alert('Contract analysis started successfully!')
      } else {
        const error = await response.text()
        alert(`Failed to start analysis: ${error}`)
      }
    } catch (error) {
      alert(`Network error: ${error}`)
    } finally {
      setIsAnalyzing(false)
    }
  }


  const getFileIcon = (filetype: string) => {
    if (filetype === 'application/pdf') {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon pdf">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      )
    } else if (filetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon docx">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      )
    }
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon unknown">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
      </svg>
    )
  }

  if (loading) {
    return (
      <div className="contract-detail-container">
        <div className="loading-state">
          <div className="spinner large"></div>
          <p>Loading contract...</p>
        </div>
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div className="contract-detail-container">
        <div className="error-state">
          <p>Error: {error || 'Contract not found'}</p>
          <Link href="/contracts" className="retry-button">
            Back to Contracts
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="contract-detail-container">
      {/* Header */}
      <div className="contract-detail-header">
        <div className="header-left">
          <Link href="/contracts" className="back-link">
            ← Back to Contracts
          </Link>
          <div className="contract-title">
            {getFileIcon(contract.filetype)}
            <h1>{contract.filename}</h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="contract-detail-content">
        {/* Left Side - PDF Viewer */}
        <div className="pdf-viewer-container">
          <div className="pdf-viewer">
            {contract.filetype === 'application/pdf' && pdfUrl ? (
              <div className="pdf-document-container">
                {!isClient ? (
                  <div className="pdf-loading">
                    <div className="spinner large"></div>
                    <p>Initializing PDF viewer...</p>
                  </div>
                ) : (
                  <>
                    {/* PDF Controls */}
                    <div className="pdf-controls">
                      {/* Zoom Controls */}
                      <div className="pdf-zoom-controls">
                        <button
                          onClick={() => handleZoomChange(Math.max(25, zoomLevel - 25))}
                          className="pdf-control-button"
                          disabled={zoomLevel <= 25}
                        >
                          −
                        </button>
                        <span className="pdf-zoom-display">{zoomLevel}%</span>
                        <button
                          onClick={() => handleZoomChange(Math.min(300, zoomLevel + 25))}
                          className="pdf-control-button"
                          disabled={zoomLevel >= 300}
                        >
                          +
                        </button>
                        <button
                          onClick={() => handleZoomChange(100)}
                          className="pdf-control-button"
                        >
                          Reset
                        </button>
                      </div>

                      {/* Search Controls */}
                      <div className="pdf-search-controls">
                        <div className="search-input-container">
                          <input
                            type="text"
                            placeholder="Search in PDF..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && searchInPDF(searchText)}
                            className="search-input"
                          />
                          <button
                            onClick={() => searchInPDF(searchText)}
                            className="search-button"
                            disabled={isSearching}
                          >
                            {isSearching ? (
                              <div className="spinner small"></div>
                            ) : (
                              'Search'
                            )}
                          </button>
                          {searchText && (
                            <button
                              onClick={clearSearch}
                              className="clear-search-button"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        {searchResults.length > 0 && (
                          <div className="search-results">
                            <span className="search-results-info">
                              {currentSearchIndex + 1} of {searchResults.length} results
                            </span>
                            <button
                              onClick={goToPreviousSearchResult}
                              className="search-nav-button"
                            >
                              ←
                            </button>
                            <button
                              onClick={goToNextSearchResult}
                              className="search-nav-button"
                            >
                              →
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* PDF Content */}
                    <div className="pdf-page-container" style={{ zoom: `${zoomLevel}%` }}>
                      {pdfLoading && (
                        <div className="pdf-loading">
                          <div className="spinner large"></div>
                          <p>Loading PDF...</p>
                        </div>
                      )}
                      <Document
                        file={pdfUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={onDocumentLoadError}
                        loading={
                          <div className="pdf-loading">
                            <div className="spinner large"></div>
                            <p>Loading PDF...</p>
                          </div>
                        }
                      >
                        {Array.from(new Array(numPages || 0), (_el, index) => (
                          <div key={`page_${index + 1}`} id={`pdf-page-${index + 1}`} className="pdf-scroll-page">
                            <Page
                              pageNumber={index + 1}
                              width={600}
                              renderTextLayer={true}
                              renderAnnotationLayer={true}
                            />
                          </div>
                        ))}
                      </Document>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="pdf-placeholder">
                <div className="file-icon-container">
                  {getFileIcon(contract.filetype)}
                </div>
                <p>Preview not available for this file type</p>
                <a
                  href={`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/contracts/${contract.id}/contents`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="download-link"
                >
                  Download File
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Tabbed Content */}
        <div className="contract-detail-sidebar">
          <div className="tabs-container">
            <div className="tabs-header">
              <button
                className={`tab-button ${activeTab === 'metadata' ? 'active' : ''}`}
                onClick={() => setActiveTab('metadata')}
              >
                Contract Metadata
              </button>
              <button
                className={`tab-button ${activeTab === 'clauses' ? 'active' : ''}`}
                onClick={() => setActiveTab('clauses')}
              >
                Extracted Clauses
              </button>
              <button
                className={`tab-button ${activeTab === 'issues' ? 'active' : ''}`}
                onClick={() => setActiveTab('issues')}
              >
                Identified Issues
              </button>
              <button
                className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                Contract Chat
              </button>
            </div>
            <div className="tab-content">
              {activeTab === 'metadata' && (
                <div className="tab-panel">
                  <div className="tab-header">
                    <h3>Contract Metadata</h3>
                    <div className="tab-header-actions">
                      {hasChanges && (
                        <button
                          onClick={handleSaveMetadata}
                          disabled={isSaving}
                          className="save-button"
                        >
                          {isSaving ? (
                            <>
                              <div className="spinner small"></div>
                              Saving...
                            </>
                          ) : (
                            'Save Changes'
                          )}
                        </button>
                      )}
                      {getIngestCTA()}
                    </div>
                  </div>

                  <div className="metadata-form">
                    <div className="form-group">
                      <label htmlFor="document_type">Document Type</label>
                      <select
                        id="document_type"
                        value={metadata.document_type}
                        onChange={(e) => handleMetadataChange('document_type', e.target.value)}
                        className="form-select"
                      >
                        <option value="Master Agreement">Master Agreement</option>
                        <option value="Statement of Work">Statement of Work</option>
                        <option value="Purchase Order">Purchase Order</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="document_title">Document Title</label>
                      <input
                        type="text"
                        id="document_title"
                        value={metadata.document_title || ''}
                        onChange={(e) => handleMetadataChange('document_title', e.target.value)}
                        className="form-input"
                        placeholder="Enter document title"
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="customer_name">Customer Name</label>
                        <input
                          type="text"
                          id="customer_name"
                          value={metadata.customer_name || ''}
                          onChange={(e) => handleMetadataChange('customer_name', e.target.value)}
                          className="form-input"
                          placeholder="Enter customer name"
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="supplier_name">Supplier Name</label>
                        <input
                          type="text"
                          id="supplier_name"
                          value={metadata.supplier_name || ''}
                          onChange={(e) => handleMetadataChange('supplier_name', e.target.value)}
                          className="form-input"
                          placeholder="Enter supplier name"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="effective_date">Effective Date</label>
                        <input
                          type="date"
                          id="effective_date"
                          value={metadata.effective_date || ''}
                          onChange={(e) => handleMetadataChange('effective_date', e.target.value)}
                          className="form-input"
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="initial_term">Initial Term</label>
                        <input
                          type="text"
                          id="initial_term"
                          value={metadata.initial_term || ''}
                          onChange={(e) => handleMetadataChange('initial_term', e.target.value)}
                          className="form-input"
                          placeholder="e.g., 12 months, 2 years"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'clauses' && (
                <div className="tab-panel">
                  <div className="tab-header">
                    <h3>Extracted Clauses</h3>
                    <div className="tab-header-actions">
                      {getIngestCTA()}
                    </div>
                  </div>

                  {clausesLoading ? (
                    <div className="clauses-loading">
                      <div className="spinner large"></div>
                      <p>Loading clauses...</p>
                    </div>
                  ) : (
                    <div className="clauses-list">
                      {standardClauses.map((standardClause) => {
                        const contractClause = getContractClauseForStandardClause(standardClause.id)
                        const isFound = !!contractClause
                        const isExpanded = expandedClause === standardClause.id

                        return (
                          <div key={standardClause.id} className={`clause-item ${isFound ? 'found' : 'missing'}`}>
                            <div className="clause-header" onClick={() => isFound && toggleClauseExpansion(standardClause.id)}>
                              <div className="clause-status">
                                {isFound ? (
                                  <div className="status-icon found">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                      <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                                    </svg>
                                  </div>
                                ) : (
                                  <div className="status-icon missing">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                      <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                                    </svg>
                                  </div>
                                )}
                              </div>
                              <div className="clause-name">
                                {standardClause.display_name}
                              </div>
                              {isFound && (
                                <div className="clause-expand">
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 12 12"
                                    fill="currentColor"
                                    className={`expand-icon ${isExpanded ? 'expanded' : ''}`}
                                  >
                                    <path d="M6 8L2 4h8l-4 4z"/>
                                  </svg>
                                </div>
                              )}
                            </div>

                            {isFound && isExpanded && contractClause && (
                              <div className="clause-content">
                                <div className="clause-markdown">
                                  <ReactMarkdown>{contractClause.cleaned_markdown}</ReactMarkdown>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'issues' && (
                <div className="tab-panel">
                  <div className="tab-header">
                    <h3>Identified Issues</h3>
                    <div className="tab-header-actions">
                      {getAnalyzeCTA()}
                    </div>
                  </div>

                  {issuesLoading ? (
                    <div className="issues-loading">
                      <div className="spinner large"></div>
                      <p>Loading issues...</p>
                    </div>
                  ) : (
                    <div className="issues-list">
                      {Object.entries(getIssuesByStandardClause()).map(([clauseId, issues]) => {
                        const standardClause = issues[0]?.standard_clause
                        if (!standardClause) return null

                        const isExpanded = expandedIssueClause === clauseId

                        return (
                          <div key={clauseId} className="issue-clause-item">
                            <div className="issue-clause-header" onClick={() => toggleIssueClauseExpansion(clauseId)}>
                              <div className="issue-clause-info">
                                <div className="issue-clause-name">
                                  {standardClause.display_name}
                                </div>
                                <div className="issue-count">
                                  {issues.length} issue{issues.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                              <div className="issue-clause-expand">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 12 12"
                                  fill="currentColor"
                                  className={`expand-icon ${isExpanded ? 'expanded' : ''}`}
                                >
                                  <path d="M6 8L2 4h8l-4 4z"/>
                                </svg>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="issue-clause-content">
                                {issues.map((issue) => (
                                  <div key={issue.id} className={`issue-item severity-${getSeverityLevel(issue.standard_clause_rule?.severity || '')}`}>
                                    <div className="issue-header">
                                      <div className="issue-rule">
                                        <div
                                          className={`issue-info-tooltip severity-${getSeverityLevel(issue.standard_clause_rule?.severity || '')}`}
                                          onMouseEnter={() => setHoveredIssueId(issue.id)}
                                          onMouseLeave={() => setHoveredIssueId(null)}
                                        >
                                          <span className="info-badge">i</span>
                                          {hoveredIssueId === issue.id && (
                                            <div className="custom-tooltip">
                                              <div className="tooltip-content">
                                                {issue.explanation}
                                              </div>
                                              <div className="tooltip-arrow"></div>
                                            </div>
                                          )}
                                        </div>
                                        <div className="issue-title">
                                          {issue.standard_clause_rule?.title || 'Unknown Issue'}
                                        </div>
                                      </div>
                                      <div className="issue-sections">
                                        {issue.citations && issue.citations.length > 0 ? (
                                          <div className="section-numbers">
                                            {issue.citations.map((citation, index) => (
                                              <button
                                                key={index}
                                                type="button"
                                                className="section-number link"
                                                onClick={() => navigateToPage((citation.beg_page || 1))}
                                                title={citation.section_name || `Section ${citation.section_number}`}
                                              >
                                                {citation.section_number}
                                              </button>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="no-sections">No sections</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {Object.keys(getIssuesByStandardClause()).length === 0 && (
                        <div className="no-issues">
                          <div className="no-issues-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M9 12l2 2 4-4"/>
                              <circle cx="12" cy="12" r="10"/>
                            </svg>
                          </div>
                          <h4>No Issues Found</h4>
                          <p>This contract appears to be compliant with all standard clause rules.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'chat' && (
                <div className="tab-panel">
                  <div className="tab-header">
                    <h3>Contract Chat</h3>
                    <div className="tab-header-actions">
                      <button className="cta-button secondary" onClick={handleNewChat} disabled={isSendingMessage}>
                        {isSendingMessage ? 'New Chat' : 'New Chat'}
                      </button>
                      {getIngestCTA()}
                    </div>
                  </div>

                  <div className="chat-container">
                    {isChatLoading ? (
                      <div className="issues-loading">
                        <div className="spinner large"></div>
                        <p>Loading chat...</p>
                      </div>
                    ) : (
                      <>
                        <div className="chat-messages">
                          {chatMessages.length === 0 && (
                            <div className="empty-state">
                              <p>No messages yet. Start a new conversation below.</p>
                            </div>
                          )}
                          {chatMessages.map((msg) => (
                            <div key={msg.id} className={`chat-message ${msg.role}`}>
                              <div className="chat-message-meta">
                                <span className="role">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
                                <span className={`status ${msg.status.replace('_', '-')}`}>{msg.status.replace('_', ' ')}</span>
                              </div>
                              <div className="chat-message-content">
                                {msg.role === 'assistant' ? (
                                  <div className="assistant-content">{renderAssistantContent(msg.content, msg.citations)}</div>
                                ) : (
                                  <div className="user-content">{msg.content}</div>
                                )}
                              </div>
                            </div>
                          ))}
                          <div ref={chatEndRef} />
                        </div>

                        <div className="chat-input-container">
                          <input
                            type="text"
                            className="form-input"
                            placeholder={contract.status === 'Uploaded' ? 'Ingest the contract before chatting' : 'Type your message and press Enter...'}
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                sendChatMessage()
                              }
                            }}
                            disabled={isSendingMessage || contract.status === 'Uploaded' || contract.status === 'Processing'}
                          />
                          <button
                            className="cta-button primary"
                            onClick={sendChatMessage}
                            disabled={isSendingMessage || !chatInput.trim() || contract.status === 'Uploaded' || contract.status === 'Processing'}
                          >
                            {isSendingMessage ? (
                              <>
                                <div className="spinner small"></div>
                                Sending...
                              </>
                            ) : (
                              'Send'
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ContractDetailPage
