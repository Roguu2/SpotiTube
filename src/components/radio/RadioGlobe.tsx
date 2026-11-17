import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world110 from 'world-atlas/countries-110m.json'
import { IconButton } from '@/components/ui/IconButton'

/** A spot on the globe with one or more stations. */
export interface GlobePlace {
  id: string
  name: string
  lat: number
  lon: number
  count: number
}

/** Where the globe should turn to; a new `key` starts a new flight. */
export interface GlobeFocus {
  lat: number
  lon: number
  zoom?: number
  key: number
}

interface RadioGlobeProps {
  places: GlobePlace[]
  selectedId: string | null
  playingId: string | null
  focus: GlobeFocus | null
  onSelect(place: GlobePlace): void
}

interface Land {
  countries: GeoPermissibleObjects
  borders: GeoPermissibleObjects
}

interface View {
  lambda: number
  phi: number
  zoom: number
}

interface Projected {
  place: GlobePlace
  x: number
  y: number
}

const MIN_ZOOM = 0.9
const MAX_ZOOM = 16
/** Past this zoom the coarse coastlines look blocky; the detailed map loads then. */
const DETAIL_ZOOM = 2.4
const FLIGHT_MS = 1_100
/** How close (px) the pointer must be to pick a place. */
const PICK_RADIUS = 14
const GRATICULE = geoGraticule10()
const SPHERE: GeoPermissibleObjects = { type: 'Sphere' }

function landOf(topology: Topology): Land {
  const countries = topology.objects.countries as GeometryCollection
  return { countries: feature(topology, countries), borders: mesh(topology, countries, (a, b) => a !== b) }
}

const COARSE_LAND = landOf(world110 as unknown as Topology)
let detailedLand: Promise<Land> | null = null

function loadDetailedLand(): Promise<Land> {
  detailedLand ??= import('world-atlas/countries-50m.json').then((m) => landOf(m.default as unknown as Topology))
  return detailedLand
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/**
 * A spinning globe of radio stations, Radio Garden style: drag to turn, scroll
 * to zoom, click a green dot to see what's on air there. Drawn on a canvas;
 * the selected and playing places get DOM markers so they can pulse cheaply.
 */
export function RadioGlobe({ places, selectedId, playingId, focus, onSelect }: RadioGlobeProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLDivElement>(null)
  const playingRef = useRef<HTMLDivElement>(null)

  const view = useRef<View>({ lambda: -15, phi: -35, zoom: 1 })
  const land = useRef<Land>(COARSE_LAND)
  const size = useRef({ width: 0, height: 0 })
  const projected = useRef<Projected[]>([])
  const frame = useRef<number | null>(null)
  const flight = useRef<number | null>(null)
  const drag = useRef<{ x: number; y: number; lambda: number; phi: number; moved: boolean } | null>(null)

  // The latest props, read by the drawing code outside React's render.
  const latest = useRef({ places, selectedId, playingId, onSelect })
  latest.current = { places, selectedId, playingId, onSelect }

  const projection = useRef(geoOrthographic().clipAngle(90).precision(0.4))

  const radius = (): number => (Math.min(size.current.width, size.current.height) / 2) * 0.9 * view.current.zoom

  const placeMarker = (el: HTMLDivElement | null, id: string | null): void => {
    if (!el) return
    const hit = id ? projected.current.find((p) => p.place.id === id) : undefined
    el.style.display = hit ? 'block' : 'none'
    if (hit) el.style.transform = `translate(${hit.x}px, ${hit.y}px)`
  }

  const draw = (): void => {
    frame.current = null
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const { width, height } = size.current
    if (!canvas || !ctx || !width || !height) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const { lambda, phi, zoom } = view.current
    const r = radius()
    const cx = width / 2
    const cy = height / 2
    const proj = projection.current.translate([cx, cy]).scale(r).rotate([lambda, phi])
    const path = geoPath(proj, ctx)

    // Atmosphere around the edge of the planet.
    const halo = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.18)
    halo.addColorStop(0, 'rgba(29,185,84,0.16)')
    halo.addColorStop(1, 'rgba(29,185,84,0)')
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, width, height)

    const ocean = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r)
    ocean.addColorStop(0, '#13202e')
    ocean.addColorStop(1, '#090e15')
    ctx.beginPath()
    path(SPHERE)
    ctx.fillStyle = ocean
    ctx.fill()

    ctx.beginPath()
    path(GRATICULE)
    ctx.strokeStyle = 'rgba(255,255,255,0.045)'
    ctx.lineWidth = 0.6
    ctx.stroke()

    ctx.beginPath()
    path(land.current.countries)
    ctx.fillStyle = '#1d2834'
    ctx.fill()
    ctx.beginPath()
    path(land.current.borders)
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'
    ctx.lineWidth = 0.6
    ctx.stroke()

    ctx.beginPath()
    path(SPHERE)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Stations: a soft halo pass, then the dots, each as one path.
    const center: [number, number] = [-lambda, -phi]
    const visible: Projected[] = []
    for (const place of latest.current.places) {
      if (geoDistance([place.lon, place.lat], center) > Math.PI / 2 - 0.02) continue
      const point = proj([place.lon, place.lat])
      if (point) visible.push({ place, x: point[0], y: point[1] })
    }
    projected.current = visible

    const scale = Math.min(1.8, Math.max(0.7, zoom ** 0.35 * 0.85))
    const dot = (count: number): number => Math.min(3.6, 1.1 + Math.log2(count) * 0.38) * scale
    ctx.beginPath()
    for (const { place, x, y } of visible) {
      const s = dot(place.count) * 2
      ctx.moveTo(x + s, y)
      ctx.arc(x, y, s, 0, Math.PI * 2)
    }
    ctx.fillStyle = 'rgba(29,185,84,0.1)'
    ctx.fill()
    ctx.beginPath()
    for (const { place, x, y } of visible) {
      const s = dot(place.count)
      ctx.moveTo(x + s, y)
      ctx.arc(x, y, s, 0, Math.PI * 2)
    }
    ctx.fillStyle = '#2ee673'
    ctx.fill()

    placeMarker(selectedRef.current, latest.current.selectedId)
    placeMarker(playingRef.current, latest.current.playingId)
  }

  const requestDraw = (): void => {
    if (frame.current === null) frame.current = requestAnimationFrame(draw)
  }

  const setZoom = (zoom: number): void => {
    view.current.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
    if (view.current.zoom >= DETAIL_ZOOM && land.current === COARSE_LAND) {
      void loadDetailedLand().then((detailed) => {
        land.current = detailed
        requestDraw()
      })
    }
    requestDraw()
  }

  const stopFlight = (): void => {
    if (flight.current !== null) cancelAnimationFrame(flight.current)
    flight.current = null
  }

  const nearest = (x: number, y: number): Projected | null => {
    let best: Projected | null = null
    let bestDistance = PICK_RADIUS * PICK_RADIUS
    for (const p of projected.current) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < bestDistance) {
        best = p
        bestDistance = d
      }
    }
    return best
  }

  const showTooltip = (hit: Projected | null): void => {
    const el = tooltipRef.current
    if (!el) return
    el.style.display = hit ? 'block' : 'none'
    if (!hit) return
    el.textContent = `${hit.place.name} · ${hit.place.count} ${hit.place.count === 1 ? 'station' : 'stations'}`
    el.style.transform = `translate(${hit.x}px, ${hit.y - 14}px) translate(-50%, -100%)`
  }

  const local = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0) return
    stopFlight()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, lambda: view.current.lambda, phi: view.current.phi, moved: false }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const d = drag.current
    if (d) {
      const dx = event.clientX - d.x
      const dy = event.clientY - d.y
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      if (!d.moved) return
      const degreesPerPixel = 180 / Math.PI / radius()
      view.current.lambda = d.lambda + dx * degreesPerPixel
      view.current.phi = Math.min(85, Math.max(-85, d.phi - dy * degreesPerPixel))
      showTooltip(null)
      requestDraw()
      return
    }
    const { x, y } = local(event)
    const hit = nearest(x, y)
    showTooltip(hit)
    event.currentTarget.style.cursor = hit ? 'pointer' : 'grab'
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved) return
    const { x, y } = local(event)
    const hit = nearest(x, y)
    if (hit) latest.current.onSelect(hit.place)
  }

  // Size the canvas to its box (and the screen's pixel density).
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const dpr = window.devicePixelRatio || 1
      size.current = { width, height }
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      draw()
    })
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  // Scrolling must zoom the globe, not the page: React's wheel listener is passive.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      stopFlight()
      setZoom(view.current.zoom * Math.exp(-event.deltaY * 0.0016))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(requestDraw, [places, selectedId, playingId])

  // Fly to a new focus along the great circle, zooming on the way.
  useEffect(() => {
    if (!focus) return
    stopFlight()
    const from: [number, number] = [-view.current.lambda, -view.current.phi]
    const route = geoInterpolate(from, [focus.lon, focus.lat])
    const fromZoom = view.current.zoom
    const toZoom = focus.zoom ?? fromZoom
    const started = performance.now()
    const step = (now: number): void => {
      const t = Math.min(1, (now - started) / FLIGHT_MS)
      const e = easeInOut(t)
      const [lon, lat] = route(e)
      view.current.lambda = -lon
      view.current.phi = Math.min(85, Math.max(-85, -lat))
      setZoom(fromZoom + (toZoom - fromZoom) * e)
      draw()
      flight.current = t < 1 ? requestAnimationFrame(step) : null
    }
    flight.current = requestAnimationFrame(step)
    return stopFlight
  }, [focus?.key])

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      stopFlight()
    },
    []
  )

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Globe of radio stations. Drag to turn, scroll to zoom, click a green dot to list its stations."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => showTooltip(null)}
        className="block cursor-grab touch-none select-none active:cursor-grabbing"
      />
      <div ref={selectedRef} className="pointer-events-none absolute top-0 left-0 hidden" aria-hidden="true">
        <span className="absolute -top-3 -left-3 size-6 rounded-full ring-2 ring-white/90 shadow-[0_0_16px_rgba(255,255,255,0.45)]" />
      </div>
      <div ref={playingRef} className="pointer-events-none absolute top-0 left-0 hidden" aria-hidden="true">
        <span className="absolute -top-4 -left-4 size-8 animate-ping rounded-full bg-amber-400/50" />
        <span className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.9)]" />
      </div>
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute top-0 left-0 hidden rounded-md bg-zinc-900/95 px-2 py-1 text-[12px] whitespace-nowrap text-zinc-100 shadow-lg ring-1 ring-white/10"
      />
      <div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-lg bg-black/40 p-1 ring-1 ring-white/10 backdrop-blur">
        <IconButton label="Zoom in" size="sm" onClick={() => setZoom(view.current.zoom * 1.6)}>
          <Plus size={16} />
        </IconButton>
        <IconButton label="Zoom out" size="sm" onClick={() => setZoom(view.current.zoom / 1.6)}>
          <Minus size={16} />
        </IconButton>
      </div>
    </div>
  )
}
