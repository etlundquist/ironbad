import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Contract } from '../../lib/types'
import { getContractContentUrl } from '../../lib/api'
import { getFileIcon } from '../../lib/utils'
import { usePDFViewer } from '../../hooks/usePDFViewer'
import { Spinner } from '../common/Spinner'

const Document = dynamic(() => import('react-pdf').then(mod => mod.Document), { ssr: false })
const Page = dynamic(() => import('react-pdf').then(mod => mod.Page), { ssr: false })

interface PDFViewerProps {
  contract: Contract
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ contract }) => {
  const [isClient, setIsClient] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  const {
    numPages,
    pageNumber,
    zoomLevel,
    searchText,
    searchResults,
    currentSearchIndex,
    isSearching,
    setSearchText,
    setSearchResults,
    setCurrentSearchIndex,
    setIsSearching,
    onDocumentLoadSuccess,
    navigateToPage,
    handleZoomChange,
    clearSearch,
    goToNextSearchResult,
    goToPreviousSearchResult
  } = usePDFViewer()

  useEffect(() => {
    setIsClient(true)
    if (contract.filetype === 'application/pdf') {
      setPdfUrl(getContractContentUrl(contract.id))
    }
  }, [contract])

  useEffect(() => {
    if (isClient && typeof window !== 'undefined') {
      import('react-pdf').then(({ pdfjs }) => {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
      }).catch(() => {})
    }
  }, [isClient])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).pdfViewerFunctions = { navigateToPage, highlightText: (text: string, pageNumber?: number) => {
        if (typeof pageNumber === 'number') navigateToPage(pageNumber)
        console.log('Highlight requested for text:', text, 'on page:', pageNumber)
      }, searchInPDF: searchInPDF }
    }
  }, [navigateToPage])

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error)
    setPdfLoading(false)
  }

  const clearHighlights = () => {
    const highlights = document.querySelectorAll('.pdf-search-highlight')
    highlights.forEach(highlight => {
      highlight.remove()
    })
  }

  const highlightTextInPage = (pageElement: HTMLElement, searchText: string, currentIndex: number) => {
    setTimeout(() => {
      const textLayer = pageElement.querySelector('.react-pdf__Page__textContent')
      if (!textLayer) return

      const searchTerm = searchText.toLowerCase()
      const fullText = textLayer.textContent || ''

      if (fullText.toLowerCase().includes(searchTerm)) {
        const textSpans = Array.from(textLayer.querySelectorAll('span'))
        const textNodes = textSpans.map(span => ({
          element: span,
          text: span.textContent || '',
          startIndex: 0,
          endIndex: 0
        }))

        let currentPos = 0
        textNodes.forEach(node => {
          node.startIndex = currentPos
          node.endIndex = currentPos + node.text.length
          currentPos += node.text.length
        })

        const regex = new RegExp(`(${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
        let match
        let matchIndex = 0

        while ((match = regex.exec(fullText)) !== null) {
          const matchStart = match.index
          const matchEnd = match.index + match[0].length

          const affectedSpans = textNodes.filter(node =>
            node.startIndex < matchEnd && node.endIndex > matchStart
          )

          if (affectedSpans.length > 0) {
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
              affectedSpans.forEach((span, spanIndex) => {
                const spanStart = Math.max(0, matchStart - span.startIndex)
                const spanEnd = Math.min(span.text.length, matchEnd - span.startIndex)

                const isCurrent = currentIndex >= 0 && matchIndex === currentIndex
                const className = isCurrent ? 'pdf-search-highlight current' : 'pdf-search-highlight'

                if (spanIndex === 0) {
                  const beforeText = span.text.substring(0, spanStart)
                  const matchText = span.text.substring(spanStart)
                  span.element.innerHTML = beforeText + `<span class="${className}">${matchText}</span>`
                } else if (spanIndex === affectedSpans.length - 1) {
                  const matchText = span.text.substring(0, spanEnd)
                  const afterText = span.text.substring(spanEnd)
                  span.element.innerHTML = `<span class="${className}">${matchText}</span>` + afterText
                } else {
                  span.element.innerHTML = `<span class="${className}">${span.text}</span>`
                }
              })
            }

            matchIndex++
          }
        }
      }
    }, 200)
  }

  const performSearch = async (text: string) => {
    setIsSearching(true)
    try {
      clearHighlights()

      const results = []
      const searchTerm = text.toLowerCase()

      for (let i = 1; i <= (numPages || 0); i++) {
        const pageElement = document.getElementById(`pdf-page-${i}`)
        if (pageElement) {
          const textContent = pageElement.textContent?.toLowerCase() || ''
          if (textContent.includes(searchTerm)) {
            results.push({ page: i, text: text })
            highlightTextInPage(pageElement, text, i === 1 ? 0 : -1)
          }
        }
      }

      setSearchResults(results)
      setCurrentSearchIndex(0)

      if (results.length > 0) {
        navigateToPage(results[0].page)
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsSearching(false)
    }
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

  if (contract.filetype !== 'application/pdf' || !pdfUrl) {
    return (
      <div className="pdf-viewer-container">
        <div className="pdf-viewer">
          <div className="pdf-placeholder">
            <div className="file-icon-container">
              {getFileIcon(contract.filetype)}
            </div>
            <p>Preview not available for this file type</p>
            <a
              href={getContractContentUrl(contract.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="download-link"
            >
              Download File
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-viewer">
        {!isClient ? (
          <div className="pdf-loading">
            <Spinner size="large" />
            <p>Initializing PDF viewer...</p>
          </div>
        ) : (
          <div className="pdf-document-container">
            <div className="pdf-controls">
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
                    {isSearching ? <Spinner size="small" /> : 'Search'}
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

            <div className="pdf-page-container" style={{ zoom: `${zoomLevel}%` }}>
              {pdfLoading && (
                <div className="pdf-loading">
                  <Spinner size="large" />
                  <p>Loading PDF...</p>
                </div>
              )}
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="pdf-loading">
                    <Spinner size="large" />
                    <p>Loading PDF...</p>
                  </div>
                }
              >
                <div className="pdf-pages-wrapper">
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
                </div>
              </Document>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

