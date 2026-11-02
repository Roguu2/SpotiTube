import { useEffect, useState, type ReactNode } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import type { DesktopPlatform } from '@core/ipc'

interface TitleBarProps {
  platform: DesktopPlatform
}

export function TitleBar({ platform }: TitleBarProps) {
  const [maximized, setMaximized] = useState(false)
  const isMac = platform === 'darwin'

  useEffect(() => {
    void window.electronAPI.window.isMaximized().then(setMaximized)
    return window.electronAPI.window.onMaximizedChange(setMaximized)
  }, [])

  return (
    <header
      className="app-drag flex h-11 shrink-0 items-center justify-between border-b border-white/5 bg-base/80 backdrop-blur-xl"
      onDoubleClick={() => window.electronAPI.window.toggleMaximize()}
    >
      {/* macOS traffic lights sit in the first ~80px (hiddenInset). */}
      <div className={`flex items-center gap-2.5 ${isMac ? 'pl-20' : 'pl-4'}`}>
        <Logo />
        <span className="text-[13px] font-semibold tracking-tight text-zinc-200">
          Spoti<span className="bg-gradient-to-r from-spotify to-ytmusic bg-clip-text text-transparent">Tube</span>
        </span>
      </div>

      {!isMac && (
        <div className="app-no-drag flex h-full" onDoubleClick={(e) => e.stopPropagation()}>
          <WindowButton label="Minimize" onClick={() => window.electronAPI.window.minimize()}>
            <Minus size={15} strokeWidth={1.75} />
          </WindowButton>
          <WindowButton
            label={maximized ? 'Restore' : 'Maximize'}
            onClick={() => window.electronAPI.window.toggleMaximize()}
          >
            {maximized ? (
              <Copy size={12} strokeWidth={1.75} className="-scale-x-100" />
            ) : (
              <Square size={12} strokeWidth={1.75} />
            )}
          </WindowButton>
          <WindowButton label="Close" danger onClick={() => window.electronAPI.window.close()}>
            <X size={16} strokeWidth={1.75} />
          </WindowButton>
        </div>
      )}
    </header>
  )
}

interface WindowButtonProps {
  label: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}

function WindowButton({ label, danger = false, onClick, children }: WindowButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-full w-12 items-center justify-center text-zinc-400 transition-colors ${
        danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-white/10 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="st-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1DB954" />
          <stop offset="100%" stopColor="#FF0000" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#st-logo)" />
      <path d="M9.5 7.5v9l7-4.5z" fill="#09090b" />
    </svg>
  )
}
