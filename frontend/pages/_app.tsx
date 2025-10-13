import type { AppProps } from 'next/app'
import '../styles/globals.css'
import Header from '../components/common/Header'
import { NotificationProvider } from '../components/common/NotificationProvider'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <NotificationProvider>
      <Header />
      <Component {...pageProps} />
    </NotificationProvider>
  )
}
