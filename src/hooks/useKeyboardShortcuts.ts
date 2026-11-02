import { useEffect } from 'react'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/**
 * Space play/pause · ←/→ seek 5 s · Ctrl+←/→ previous/next · ↑/↓ volume ·
 * M mute · Ctrl+F search · Ctrl+E Audio Studio · Ctrl+, settings.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey
      const engine = useAudioEngineStore.getState()
      const player = usePlayerStore.getState()

      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        useLibraryStore.getState().navigate({ kind: 'search' })
        return
      }
      if (mod && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        useSettingsStore.getState().toggleStudio()
        return
      }
      if (mod && event.key === ',') {
        event.preventDefault()
        useSettingsStore.getState().setSettingsOpen(true)
        return
      }

      // Everything below is for the focused window only, never while typing or on a focused control.
      if (isTyping(event.target) || (event.target as HTMLElement | null)?.getAttribute('role') === 'slider') return
      if (!engine.hydrated) return

      switch (event.key) {
        case ' ':
          if ((event.target as HTMLElement | null)?.tagName === 'BUTTON') return
          event.preventDefault()
          void player.togglePlay()
          break
        case 'ArrowRight':
          event.preventDefault()
          if (mod) void player.next()
          else engine.seek(engine.transport.currentTime + 5)
          break
        case 'ArrowLeft':
          event.preventDefault()
          if (mod) void player.previous()
          else engine.seek(engine.transport.currentTime - 5)
          break
        case 'ArrowUp':
          event.preventDefault()
          engine.setVolume(Math.min(1, engine.volume + 0.05))
          break
        case 'ArrowDown':
          event.preventDefault()
          engine.setVolume(Math.max(0, engine.volume - 0.05))
          break
        case 'm':
        case 'M':
          engine.toggleMute()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
