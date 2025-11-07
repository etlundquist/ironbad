import React, { useState, useEffect, useCallback } from 'react'
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
    goToPreviousSearchResult,
    clearHighlights
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
      ;(window as any).pdfViewerFunctions = {
        navigateToPage,
        highlightText: (text: string, pageNumber?: number) => {
          if (typeof pageNumber === 'number') navigateToPage(pageNumber)
          console.log('Highlight requested for text:', text, 'on page:', pageNumber)
        },
        searchInPDF: searchInPDF
      }
    }
  }, [navigateToPage])

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error)
    setPdfLoading(false)
  }

  const waitForTextLayer = (pageElement: HTMLElement): Promise<HTMLElement | null> => {
    return new Promise(resolve => {
      const existingLayer = pageElement.querySelector<HTMLElement>('.react-pdf__Page__textContent')
      if (existingLayer) {
        resolve(existingLayer)
        return
      }

      const observer = new MutationObserver(() => {
        const layer = pageElement.querySelector<HTMLElement>('.react-pdf__Page__textContent')
        if (layer) {
          observer.disconnect()
          resolve(layer)
        }
      })

      observer.observe(pageElement, { childList: true, subtree: true })

      // Fallback in case the text layer never renders
      setTimeout(() => {
        observer.disconnect()
        resolve(pageElement.querySelector<HTMLElement>('.react-pdf__Page__textContent'))
      }, 1500)
    })
  }

  const buildTextSegments = (root: HTMLElement) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
    let currentNode = walker.nextNode() as Text | null
    let currentIndex = 0
    const segments: Array<{ node: Text; start: number; end: number }> = []
    let fullText = ''

    while (currentNode) {
      const textContent = currentNode.textContent || ''
      const start = currentIndex
      const end = start + textContent.length
      segments.push({ node: currentNode, start, end })
      fullText += textContent
      currentIndex = end
      currentNode = walker.nextNode() as Text | null
    }

    return { segments, fullText }
  }

  const findTextNodeAtPosition = (
    segments: Array<{ node: Text; start: number; end: number }>,
    position: number,
    preferEnd = false
  ) => {
    for (const segment of segments) {
      const { start, end } = segment
      const withinStart = position >= start && position < end
      const withinEnd = preferEnd ? position > start && position <= end : withinStart

      if ((!preferEnd && withinStart) || (preferEnd && withinEnd)) {
        const offset = Math.max(0, Math.min(position - start, (segment.node.textContent || '').length))
        return { node: segment.node, offset }
      }
    }

    if (preferEnd && segments.length > 0) {
      const last = segments[segments.length - 1]
      return { node: last.node, offset: (last.node.textContent || '').length }
    }

    return null
  }

  const highlightTextLayer = (textLayer: HTMLElement, searchTerm: string, startingIndex: number) => {
    const { segments, fullText } = buildTextSegments(textLayer)

    if (!fullText) return 0

    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'gi')

    let match: RegExpExecArray | null
    let matchesOnLayer = 0

    while ((match = regex.exec(fullText)) !== null) {
      const matchStart = match.index
      const matchEnd = match.index + match[0].length

      const startNodeInfo = findTextNodeAtPosition(segments, matchStart)
      const endNodeInfo = findTextNodeAtPosition(segments, matchEnd, true)

      if (!startNodeInfo || !endNodeInfo) {
        continue
      }

      const range = document.createRange()
      range.setStart(startNodeInfo.node, startNodeInfo.offset)
      range.setEnd(endNodeInfo.node, endNodeInfo.offset)

      const highlightSpan = document.createElement('span')
      highlightSpan.className = 'pdf-search-highlight'
      highlightSpan.setAttribute('data-result-index', `${startingIndex + matchesOnLayer}`)

      try {
        range.surroundContents(highlightSpan)
      } catch {
        const contents = range.extractContents()
        highlightSpan.appendChild(contents)
        range.insertNode(highlightSpan)
      }

      matchesOnLayer++
    }

    return matchesOnLayer
  }

  const updateCurrentHighlightClass = useCallback(
    (index: number) => {
      const highlights = document.querySelectorAll<HTMLElement>('.pdf-search-highlight')
      highlights.forEach(span => {
        const highlightIndex = Number(span.dataset.resultIndex ?? -1)
        if (highlightIndex === index && index >= 0) {
          span.classList.add('current')
        } else {
          span.classList.remove('current')
        }
      })
    },
    []
  )

  const performSearch = async (text: string) => {
    setIsSearching(true)
    try {
      clearHighlights()

      const results: Array<{ page: number; text: string; index: number }> = []
      const normalizedSearch = text.trim()

      if (!normalizedSearch) {
        setSearchResults([])
        setCurrentSearchIndex(0)
        return
      }

      let matchesSoFar = 0

      for (let i = 1; i <= (numPages || 0); i++) {
        const pageElement = document.getElementById(`pdf-page-${i}`)
        if (!pageElement) continue

        const textLayer = await waitForTextLayer(pageElement)
        if (!textLayer) continue

        const matchesOnPage = highlightTextLayer(textLayer, normalizedSearch, matchesSoFar)

        if (matchesOnPage > 0) {
          for (let j = 0; j < matchesOnPage; j++) {
            results.push({ page: i, text: normalizedSearch, index: matchesSoFar + j })
          }
          matchesSoFar += matchesOnPage
        }
      }

      setSearchResults(results)
      setCurrentSearchIndex(results.length > 0 ? 0 : 0)

      if (results.length > 0) {
        navigateToPage(results[0].page)
        updateCurrentHighlightClass(0)
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
      clearHighlights()
    }
  }

  useEffect(() => {
    if (searchResults.length === 0) return
    updateCurrentHighlightClass(currentSearchIndex)
  }, [currentSearchIndex, searchResults.length, updateCurrentHighlightClass])

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

