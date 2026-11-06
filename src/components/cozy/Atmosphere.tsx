import type { CSSProperties } from 'react'
import type { Scene } from './scenes'

/**
 * What drifts across a cozy scene: lights, rain, sparks, stars or petals. Every
 * piece is one element animated with transform and opacity only, so a long
 * evening of it stays cheap. Positions come from a fixed seed: the same scene
 * looks the same each time.
 */
export function Atmosphere({ scene }: { scene: Scene }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {scene.particles === 'bokeh' && <Bokeh scene={scene} />}
      {scene.particles === 'rain' && (
        <>
          <Bokeh scene={scene} dim />
          <Rain />
        </>
      )}
      {scene.particles === 'sparks' && <Sparks scene={scene} />}
      {scene.particles === 'stars' && (
        <>
          <Stars />
          <Bokeh scene={scene} dim />
        </>
      )}
      {scene.particles === 'petals' && (
        <>
          <Bokeh scene={scene} dim />
          <Petals />
        </>
      )}
    </div>
  )
}

/** A small seeded generator (mulberry32): the same numbers on every render. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LIGHTS = [
  { left: '8%', top: '78%', size: 220, t: 34, delay: 0, dx: '40px', dy: '-260px', glow: 0.45 },
  { left: '22%', top: '88%', size: 120, t: 26, delay: -9, dx: '-30px', dy: '-220px', glow: 0.55 },
  { left: '41%', top: '92%', size: 180, t: 40, delay: -20, dx: '20px', dy: '-300px', glow: 0.35 },
  { left: '58%', top: '84%', size: 90, t: 22, delay: -4, dx: '-20px', dy: '-200px', glow: 0.6 },
  { left: '71%', top: '90%', size: 260, t: 46, delay: -30, dx: '50px', dy: '-280px', glow: 0.3 },
  { left: '86%', top: '76%', size: 140, t: 30, delay: -15, dx: '-40px', dy: '-240px', glow: 0.5 },
  { left: '93%', top: '30%', size: 110, t: 38, delay: -25, dx: '-30px', dy: '-160px', glow: 0.35 },
  { left: '3%', top: '35%', size: 150, t: 42, delay: -12, dx: '30px', dy: '-180px', glow: 0.3 }
]

/** Soft, out-of-focus lights rising slowly; a two-colour scene alternates its colours. */
function Bokeh({ scene, dim = false }: { scene: Scene; dim?: boolean }) {
  return (
    <>
      {LIGHTS.map((light, index) => {
        const colour = scene.glow2 && index % 2 === 1 ? scene.glow2 : scene.glow
        return (
          <span
            key={light.left + light.top}
            className="st-bokeh absolute rounded-full transition-[background] duration-[2s]"
            style={
              {
                left: light.left,
                top: light.top,
                width: light.size,
                height: light.size,
                background: `radial-gradient(closest-side, rgb(${colour} / 0.55), rgb(${colour} / 0.18) 55%, transparent)`,
                '--t': light.t + 's',
                '--delay': light.delay + 's',
                '--dx': light.dx,
                '--dy': light.dy,
                '--glow': dim ? light.glow * 0.45 : light.glow
              } as CSSProperties
            }
          />
        )
      })}
    </>
  )
}

const RAIN = (() => {
  const random = seeded(7)
  return Array.from({ length: 70 }, () => ({
    left: random() * 104 - 2,
    length: 50 + random() * 90,
    t: 0.7 + random() * 0.7,
    delay: -random() * 2,
    opacity: 0.12 + random() * 0.22
  }))
})()

/** Thin streaks falling at a slight slant, like rain past a window at night. */
function Rain() {
  return (
    <div className="absolute inset-0 rotate-[8deg] scale-110">
      {RAIN.map((drop, index) => (
        <span
          key={index}
          className="st-rain absolute top-0 w-px bg-gradient-to-b from-transparent to-white"
          style={
            {
              left: `${drop.left}%`,
              height: drop.length,
              opacity: drop.opacity,
              '--t': drop.t + 's',
              '--delay': drop.delay + 's'
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

const SPARKS = (() => {
  const random = seeded(11)
  return Array.from({ length: 34 }, () => ({
    left: random() * 100,
    size: 2 + random() * 3.5,
    t: 6 + random() * 8,
    delay: -random() * 14,
    dx: (random() - 0.5) * 160,
    dy: -(40 + random() * 50)
  }))
})()

/** Embers rising from below and flickering out, like sparks off a fire. */
function Sparks({ scene }: { scene: Scene }) {
  return (
    <>
      {/* The fire's glow along the bottom edge. */}
      <div
        className="st-breathe absolute inset-x-0 bottom-0 h-1/2"
        style={{ background: `radial-gradient(70% 90% at 50% 100%, rgb(${scene.glow} / 0.28), transparent 70%)` }}
      />
      {SPARKS.map((spark, index) => (
        <span
          key={index}
          className="st-spark absolute bottom-0 rounded-full"
          style={
            {
              left: `${spark.left}%`,
              width: spark.size,
              height: spark.size,
              background: `rgb(${scene.glow})`,
              boxShadow: `0 0 ${spark.size * 3}px rgb(${scene.glow} / 0.9)`,
              '--t': spark.t + 's',
              '--delay': spark.delay + 's',
              '--dx': spark.dx + 'px',
              '--dy': spark.dy + 'vh'
            } as CSSProperties
          }
        />
      ))}
    </>
  )
}

const STARS = (() => {
  const random = seeded(23)
  return Array.from({ length: 90 }, () => ({
    left: random() * 100,
    // Denser towards the top, like a sky.
    top: random() ** 1.6 * 85,
    size: random() < 0.85 ? 1.5 : 2.5,
    t: 2.5 + random() * 4,
    delay: -random() * 6,
    glow: 0.35 + random() * 0.6
  }))
})()

/** A sky of small twinkling stars. */
function Stars() {
  return (
    <>
      {STARS.map((star, index) => (
        <span
          key={index}
          className="st-twinkle absolute rounded-full bg-white"
          style={
            {
              left: `${star.left}%`,
              top: `${star.top}%`,
              width: star.size,
              height: star.size,
              '--t': star.t + 's',
              '--delay': star.delay + 's',
              '--glow': star.glow
            } as CSSProperties
          }
        />
      ))}
    </>
  )
}

const PETALS = (() => {
  const random = seeded(31)
  return Array.from({ length: 22 }, () => ({
    left: random() * 100,
    size: 9 + random() * 9,
    t: 12 + random() * 12,
    delay: -random() * 24,
    dx: 60 + random() * 160,
    hue: random() < 0.7 ? '255 183 205' : '255 222 196'
  }))
})()

/** Blossom petals tumbling slowly down and across. */
function Petals() {
  return (
    <>
      {PETALS.map((petal, index) => (
        <span
          key={index}
          className="st-petal absolute -top-8 rounded-[60%_10%_60%_10%]"
          style={
            {
              left: `${petal.left}%`,
              width: petal.size,
              height: petal.size * 0.72,
              background: `linear-gradient(135deg, rgb(${petal.hue}), rgb(${petal.hue} / 0.55))`,
              '--t': petal.t + 's',
              '--delay': petal.delay + 's',
              '--dx': petal.dx + 'px'
            } as CSSProperties
          }
        />
      ))}
    </>
  )
}
