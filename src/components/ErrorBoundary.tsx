import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Keeps a rendering bug from blanking the whole window: shows what happened and
 * lets the user rebuild the interface. Stores (playback, library) live outside
 * React, so they survive the remount.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('SpotiTube UI crashed:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 bg-base px-8 text-center">
        <h1 className="text-xl font-semibold text-zinc-100">Something went wrong</h1>
        <p className="max-w-md text-[13px] text-zinc-400">
          Part of the interface hit an unexpected error. Your library and playback are not affected.
        </p>
        <pre className="max-w-xl overflow-x-auto rounded-lg bg-black/40 px-4 py-2 text-left text-[11.5px] text-red-300/80">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="h-9 rounded-lg bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 hover:bg-white"
        >
          Try again
        </button>
      </div>
    )
  }
}
