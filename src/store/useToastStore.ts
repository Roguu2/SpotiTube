import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: Toast[]
  push(kind: ToastKind, message: string): void
  dismiss(id: number): void
}

const TTL_MS: Record<ToastKind, number> = { info: 3500, success: 3000, error: 6500 }
const MAX_VISIBLE = 4
let nextId = 1

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push(kind, message) {
    // Collapse repeats of the same message (e.g. a burst of failed tracks).
    if (get().toasts.some((t) => t.message === message)) return
    const id = nextId++
    set({ toasts: [...get().toasts, { id, kind, message }].slice(-MAX_VISIBLE) })
    window.setTimeout(() => get().dismiss(id), TTL_MS[kind])
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  }
}))

export const toast = {
  info: (message: string) => useToastStore.getState().push('info', message),
  success: (message: string) => useToastStore.getState().push('success', message),
  error: (message: string) => useToastStore.getState().push('error', message)
}
