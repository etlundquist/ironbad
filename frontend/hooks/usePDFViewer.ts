import { useState, useEffect } from 'react'

export function usePDFViewer() {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoomLevel, setZoomLevel] = useState(100)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
  }

  const navigateToPage = (page: number) => {
    if (!numPages) return
    const next = Math.min(Math.max(1, page), numPages)
    const anchor = document.getElementById(`pdf-page-${next}`)
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setPageNumber(next)
  }

  const handleZoomChange = (newZoom: number) => {
    setZoomLevel(newZoom)
  }

  const clearHighlights = () => {
    const highlights = document.querySelectorAll('.pdf-search-highlight')
    highlights.forEach(highlight => {
      const parent = highlight.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight)
      }
    })
  }

  const clearSearch = () => {
    setSearchText('')
    setSearchResults([])
    setCurrentSearchIndex(0)
    clearHighlights()
  }

  const goToNextSearchResult = () => {
    if (searchResults.length > 0) {
      const nextIndex = (currentSearchIndex + 1) % searchResults.length
      setCurrentSearchIndex(nextIndex)
      navigateToPage(searchResults[nextIndex].page)
    }
  }

  const goToPreviousSearchResult = () => {
    if (searchResults.length > 0) {
      const prevIndex = currentSearchIndex === 0 ? searchResults.length - 1 : currentSearchIndex - 1
      setCurrentSearchIndex(prevIndex)
      navigateToPage(searchResults[prevIndex].page)
    }
  }

  return {
    numPages,
    pageNumber,
    zoomLevel,
    searchText,
    searchResults,
    currentSearchIndex,
    isSearching,
    setNumPages,
    setPageNumber,
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
  }
}

