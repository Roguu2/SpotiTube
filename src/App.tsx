import { useEffect, useState } from 'react'
import type { AppInfo } from '@core/ipc'
import { TitleBar } from './components/TitleBar'

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.electronAPI.app.getInfo().then(setInfo)
  }, [])

  if (!info) return <div className="h-full bg-base" />

  return (
    <div className="flex h-full flex-col bg-base">
      <TitleBar platform={info.platform} />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-spotify/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-40 bottom-1/4 h-96 w-96 rounded-full bg-ytmusic/10 blur-3xl" />
        <div className="relative text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Spoti
            <span className="bg-gradient-to-r from-spotify to-ytmusic bg-clip-text text-transparent">Tube</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            v{info.version} · {info.platform}
            {info.isDev && ' · dev'}
          </p>
        </div>
      </main>
    </div>
  )
}
