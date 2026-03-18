import { createContext, useContext, useRef, useState } from 'react'

type Toast = { id: number; type: 'success'|'error'|'info'; title: string; message?: string }

const ToastCtx = createContext<{ toasts: Toast[]; push: (t: Omit<Toast,'id'>) => void; remove: (id: number) => void }|null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextIdRef = useRef(1)
  const push = (t: Omit<Toast,'id'>) => {
    const id = nextIdRef.current++
    setToasts((prev) => [...prev, { id, ...t }])
    setTimeout(() => remove(id), 4000)
  }
  const remove = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))
  return (
    <ToastCtx.Provider value={{ toasts, push, remove }}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded shadow px-4 py-3 text-sm text-white ${t.type==='success'?'bg-green-600':t.type==='error'?'bg-red-600':'bg-gray-800'}`}> 
            <div className="font-medium">{t.title}</div>
            {t.message && <div>{t.message}</div>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('ToastProvider missing')
  return ctx
}
