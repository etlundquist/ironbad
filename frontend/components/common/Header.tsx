import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

const Header: React.FC = () => {
  const router = useRouter()

  const isActive = (path: string) => {
    return router.pathname === path
  }

  return (
    <header style={{
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      padding: '0 2rem',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
    }}>
      {/* Logo and Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2rem'
      }}>
        {/* Logo */}
        <Link href="/contracts" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            cursor: 'pointer'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              background: '#1f2937',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              {/* Cast iron skillet icon */}
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                style={{ color: '#ffffff' }}
              >
                {/* Skillet body */}
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" fill="none"/>
                {/* Handle */}
                <path d="M20 12 L24 12 L24 10 L20 10 Z" fill="currentColor"/>
                {/* Helper handle */}
                <path d="M4 8 L6 8 L6 6 L4 6 Z" fill="currentColor"/>
                {/* Stars */}
                <path d="M12 4 L12.5 5.5 L14 5.5 L12.75 6.5 L13.25 8 L12 7 L10.75 8 L11.25 6.5 L10 5.5 L11.5 5.5 Z" fill="currentColor"/>
                <path d="M12 16 L12.5 17.5 L14 17.5 L12.75 18.5 L13.25 20 L12 19 L10.75 20 L11.25 18.5 L10 17.5 L11.5 17.5 Z" fill="currentColor"/>
              </svg>
            </div>
            <div>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: '700',
                color: '#1f2937',
                lineHeight: '1.2'
              }}>
                IRONBAD
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                fontWeight: '500',
                letterSpacing: '0.05em'
              }}>
                Automated Contract Review
              </div>
            </div>
          </div>
        </Link>

        {/* Navigation */}
        <nav style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <Link href="/upload" className={`nav-link ${isActive('/upload') ? 'active' : ''}`}>
            Upload Contracts
          </Link>
          <Link href="/contracts" className={`nav-link ${isActive('/contracts') || isActive('/') ? 'active' : ''}`}>
            View Contracts
          </Link>
          <Link href="/review" className={`nav-link ${isActive('/review') ? 'active' : ''}`}>
            Redline Agent
          </Link>
          <Link href="/standard-clauses" className={`nav-link ${isActive('/standard-clauses') ? 'active' : ''}`}>
            Clause Library
          </Link>
        </nav>
      </div>
    </header>
  )
}

export default Header
