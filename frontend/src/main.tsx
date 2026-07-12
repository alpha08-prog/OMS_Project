import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tailwind.css'
import './index.css'
import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from './components/AuthForm/Toast'
import { ConfirmProvider } from './components/common/ConfirmDialog'
import { PromptProvider } from './components/common/PromptDialog'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// staleTime: how long data is considered fresh — within this window, navigating
// back to a page reuses cache without a network call. 30s is a sensible default
// for moderately-fresh admin lists; pages that need fresher data can override.
//
// gcTime: how long unused cache stays before garbage collection. 5 minutes lets
// users navigate away and back without losing their data.
//
// refetchOnWindowFocus: false → don't refetch every time the user tabs back.
// Use the manual refresh button or page-level invalidation instead.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ConfirmProvider>
            <PromptProvider>
              <App />
            </PromptProvider>
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
