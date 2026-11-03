import { useEffect } from 'react'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'

/** The focused element, if the event came from one (keys can also target the window or document). */
function targetElement(event: KeyboardEvent): HTMLElement | null {
  return event.target instanceof HTMLElement ? event.target : null
}

function isTyping(el: HTMLElement | null): boolean {
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/**
 * Space play/pause · ←/→ seek 5 s · Ctrl+←/→ previous/next · ↑/↓ volume ·
 * M mute · Ctrl+F find/search · Ctrl+E queue · Ctrl+L lyrics · Ctrl+, settings.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey
      const engine = useAudioEngineStore.getState()
      const player = usePlayerStore.getState()

      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        // Inside a playlist, Ctrl+F finds in that playlist; elsewhere it opens Search.
        const filter = document.querySelector<HTMLInputElement>('[data-playlist-filter]')
        if (filter) {
          filter.focus()
          filter.select()
        } else {
          useLibraryStore.getState().navigate({ kind: 'search' })
        }
        return
      }
      if (mod && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        useSettingsStore.getState().toggleQueue()
        return
      }
      if (mod && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        if (usePlayerStore.getState().current || useSettingsStore.getState().nowPlayingOpen) {
          useSettingsStore.getState().toggleNowPlaying()
        }
        return
      }
      if (mod && event.key === ',') {
        event.preventDefault()
        useSettingsStore.getState().setSettingsOpen(true)
        return
      }

      // Everything below is for the focused window only, never while typing or on a focused control.
      const target = targetElement(event)
      if (isTyping(target) || target?.getAttribute('role') === 'slider') return
      if (!engine.hydrated) return

      switch (event.key) {
        case ' ':
          if (target?.tagName === 'BUTTON') return
          event.preventDefault()
          void player.togglePlay()
          break
        case 'ArrowRight':
          event.preventDefault()
          if (mod) void player.next()
          else player.seek(player.currentTime() + 5)
          break
        case 'ArrowLeft':
          event.preventDefault()
          if (mod) void player.previous()
          else player.seek(player.currentTime() - 5)
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
