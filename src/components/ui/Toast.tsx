'use client'
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

interface ToastProps {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
}

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="toast-enter fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-medium max-w-xs w-full"
      style={{ background: type === 'success' ? '#0369a1' : '#dc2626' }}>
      {type === 'success'
        ? <CheckCircle size={18} className="shrink-0" />
        : <XCircle size={18} className="shrink-0" />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose}><X size={16} /></button>
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const show = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ message, type })

  const hide = () => setToast(null)

  const ToastEl = toast
    ? <Toast message={toast.message} type={toast.type} onClose={hide} />
    : null

  return { show, ToastEl }
}
