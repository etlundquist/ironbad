import { NextPage } from 'next'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import dynamic from 'next/dynamic'

// Dynamically import react-pdf to avoid SSR issues
const Document = dynamic(() => import('react-pdf').then(mod => mod.Document), { ssr: false })
const Page = dynamic(() => import('react-pdf').then(mod => mod.Page), { ssr: false })

// CSS will be imported by Next.js automatically

interface Contract {
  id: string
  status: string
  filename: string
  filetype: string
  created_at: string
  updated_at: string
}

const ContractDetailPage: NextPage = () => {
  const router = useRouter()
  const { id } = router.query
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

  useEffect(() => {
    setIsClient(true)
    if (id) {
      fetchContract()
    }
  }, [id])

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

  const getCTAContent = () => {
    if (!contract) return null

    switch (contract.status) {
      case 'Uploaded':
        return (
          <button className="cta-button primary" onClick={() => {/* TODO: Implement parse contract */}}>
            Parse Contract
          </button>
        )
      case 'Processing':
        return (
          <div className="cta-button processing">
            <div className="spinner small"></div>
            Contract Processing
          </div>
        )
      case 'Ready for Review':
        return (
          <button className="cta-button primary" onClick={handleAnalyzeIssues} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <>
                <div className="spinner small"></div>
                Analyzing...
              </>
            ) : (
              'Analyze Issues'
            )}
          </button>
        )
      case 'Under Review':
        return (
          <button className="cta-button secondary" onClick={() => {/* TODO: Implement complete review */}}>
            Complete Review
          </button>
        )
      case 'Review Completed':
        return (
          <div className="cta-button completed">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
            Review Completed
          </div>
        )
      default:
        return null
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
        <div className="header-right">
          {getCTAContent()}
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
                  <h3>Contract Metadata</h3>
                  <p>Metadata content will be displayed here.</p>
                </div>
              )}
              {activeTab === 'clauses' && (
                <div className="tab-panel">
                  <h3>Extracted Clauses</h3>
                  <p>Extracted clauses will be displayed here.</p>
                </div>
              )}
              {activeTab === 'issues' && (
                <div className="tab-panel">
                  <h3>Identified Issues</h3>
                  <p>Identified issues will be displayed here.</p>
                </div>
              )}
              {activeTab === 'chat' && (
                <div className="tab-panel">
                  <h3>Contract Chat</h3>
                  <p>Contract chat will be displayed here.</p>
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
