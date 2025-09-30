import { NextPage } from 'next'
import Link from 'next/link'

const Home: NextPage = () => {
  return (
    <div className="container">
      <main>
        <h1>Ironbad - Contract Lifecycle Management</h1>
        <p>Welcome to your CLM application!</p>
        <div className="action-buttons">
          <Link href="/upload" className="primary-button">
            Upload Contracts
          </Link>
          <Link href="/contracts" className="secondary-button">
            View Contracts
          </Link>
        </div>
      </main>
    </div>
  )
}

export default Home
