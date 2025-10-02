import type { AppProps } from 'next/app'
import '../styles/globals.css'
import Header from '../components/Header'
import { NotificationProvider } from '../components/NotificationProvider'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <NotificationProvider>
      <Header />
      <Component {...pageProps} />
    </NotificationProvider>
  )
}
