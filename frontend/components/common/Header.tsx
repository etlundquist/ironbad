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
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <img
                src="/cast-iron.png"
                alt="Ironbad Logo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  transform: 'scale(1.15)'
                }}
              />
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
                AI-Powered Contract Review
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
          <Link href="/saved-prompts" className={`nav-link ${isActive('/saved-prompts') ? 'active' : ''}`}>
            Prompt Library
          </Link>
        </nav>
      </div>
    </header>
  )
}

export default Header
