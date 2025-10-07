import { NextPage } from 'next'
import Link from 'next/link'

const Home: NextPage = () => {
  return (
    <div className="page-container">
      <main className="main-content">
        <div className="dashboard-header">
          <h1>Ironbad</h1>
          <p>Automated Contract Review</p>
        </div>
        <div className="action-buttons">
          <Link href="/upload" className="primary-button">
            Upload Contracts
          </Link>
          <Link href="/contracts" className="secondary-button">
            View Contracts
          </Link>
          <Link href="/review" className="secondary-button">
            Review & Redline
          </Link>
          <Link href="/standard-clauses" className="secondary-button">
            Manage Standard Clauses
          </Link>
        </div>
      </main>
    </div>
  )
}

export default Home
