import type { CSSProperties, ReactNode } from 'react'
import { PIXEL_SPRITES, layerRuns, type PixelSprite } from './pixelSprites'

/**
 * A little companion in the corner of cozy mode: it nods along while music
 * plays and dozes off when it's paused. Each comes in two looks: smooth and
 * stylised, or pixel art. Drawn here as SVG, so they stay sharp at any size
 * and cost nothing to ship.
 */

export type CompanionId = 'none' | 'girl' | 'juice' | 'cat' | 'dog' | 'cocoa'
export type CompanionLook = 'stylized' | 'pixel'

export const COMPANIONS: { id: CompanionId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'girl', label: 'Girl' },
  { id: 'juice', label: 'Juice' },
  { id: 'cat', label: 'Cat' },
  { id: 'dog', label: 'Puppy' },
  { id: 'cocoa', label: 'Cocoa' }
]

export function isCompanionId(value: unknown): value is CompanionId {
  return COMPANIONS.some((companion) => companion.id === value)
}

export function isCompanionLook(value: unknown): value is CompanionLook {
  return value === 'stylized' || value === 'pixel'
}

interface CompanionProps {
  id: CompanionId
  look: CompanionLook
  playing: boolean
  /** "r g b" of the scene's light, for the details that follow the scene (headphones, mug glow). */
  accent: string
  className?: string
}

export function Companion({ id, look, playing, accent, className }: CompanionProps) {
  if (id === 'none') return null
  return (
    <svg viewBox="0 0 120 124" className={className} aria-hidden="true" overflow="visible">
      {/* A soft shadow it sits on. */}
      <ellipse cx="60" cy="121" rx="40" ry="4" fill="black" opacity="0.35" />
      {look === 'pixel' ? (
        <>
          <PixelCompanion sprite={PIXEL_SPRITES[id]} playing={playing} accent={accent} />
          {id !== 'cocoa' && <Floaters playing={playing} x={100} y={26} />}
        </>
      ) : (
        <>
          {id === 'girl' && <Girl playing={playing} accent={accent} />}
          {id === 'juice' && <JuiceGirl playing={playing} />}
          {id === 'cat' && <Cat playing={playing} />}
          {id === 'dog' && <Dog playing={playing} />}
          {id === 'cocoa' && <Cocoa playing={playing} accent={accent} />}
        </>
      )}
    </svg>
  )
}

/** How fast frame swaps run (tails, steam): brisk while music plays, lazy while asleep. */
const PIXEL_TEMPO = { playing: '0.9s', paused: '2.4s' }

/**
 * A pixel sprite, hopping a pixel to the beat while music plays and breathing
 * slowly while asleep. Layers marked for playing or paused show only then.
 */
function PixelCompanion({ sprite, playing, accent }: { sprite: PixelSprite; playing: boolean; accent: string }) {
  const state = playing ? 'playing' : 'paused'
  return (
    <svg x="6" y="13" width="108" height="108" viewBox={`0 0 ${sprite.size} ${sprite.size}`} shapeRendering="crispEdges" overflow="visible">
      <g className={playing ? 'st-px-bob' : 'st-px-breathe'}>
        {sprite.layers
          .filter((layer) => !layer.when || layer.when === state)
          .map((layer, index) => (
            <g
              key={index}
              // The sip only happens while she's awake.
              className={layer.className === 'st-px-sip' && !playing ? undefined : layer.className}
              style={{ '--px-t': PIXEL_TEMPO[state] } as CSSProperties}
            >
              {layerRuns(sprite, layer, accent).map((run) => (
                <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.width} height={1} fill={run.colour} />
              ))}
            </g>
          ))}
      </g>
    </svg>
  )
}

const INK = '#3b2a33'
const LINE = { stroke: INK, strokeWidth: 2.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

/** Open, blinking eyes while awake; closed, smiling ones while asleep. */
function Eyes({ playing, left, right, y, iris }: { playing: boolean; left: number; right: number; y: number; iris?: string }) {
  if (!playing) {
    return (
      <path
        d={`M${left - 4} ${y} Q${left} ${y + 3.5} ${left + 4} ${y} M${right - 4} ${y} Q${right} ${y + 3.5} ${right + 4} ${y}`}
        fill="none"
        stroke={INK}
        strokeWidth={2}
        strokeLinecap="round"
      />
    )
  }
  return (
    <>
      {[left, right].map((x) => (
        <g key={x} className="st-blink">
          <ellipse cx={x} cy={y} rx="4.3" ry="5.6" fill="#2d2238" />
          {iris && <ellipse cx={x} cy={y + 2.2} rx="3.1" ry="2.8" fill={iris} />}
          <circle cx={x - 1.4} cy={y - 2.2} r="1.7" fill="white" />
          <circle cx={x + 1.6} cy={y + 2.6} r="0.8" fill="white" />
        </g>
      ))}
    </>
  )
}

function Blush({ left, right, y }: { left: number; right: number; y: number }) {
  return (
    <>
      <ellipse cx={left} cy={y} rx="4.6" ry="2.4" fill="#ff8fa6" opacity="0.5" />
      <ellipse cx={right} cy={y} rx="4.6" ry="2.4" fill="#ff8fa6" opacity="0.5" />
    </>
  )
}

/** Music notes rising while it plays, z's while it sleeps. */
function Floaters({ playing, x, y }: { playing: boolean; x: number; y: number }) {
  const glyphs = playing ? ['♪', '♫', '♪'] : ['z', 'z', 'Z']
  return (
    <>
      {glyphs.map((glyph, index) => (
        <text
          key={index}
          className="st-zz"
          x={x + index * 5}
          y={y - index * 4}
          fontSize={playing ? 13 : 10 + index * 2}
          fontWeight={700}
          fill="white"
          fillOpacity={0.85}
          style={{ animationDelay: `${-index * 1.2}s`, fontFamily: 'var(--font-cozy), serif' }}
        >
          {glyph}
        </text>
      ))}
    </>
  )
}

/** Nods its head with the music, or breathes slowly while asleep. */
function Bob({ playing, pivot, children }: { playing: boolean; pivot: string; children: ReactNode }) {
  return (
    <g className={playing ? 'st-nod' : undefined} style={{ transformOrigin: pivot }}>
      {children}
    </g>
  )
}

function Girl({ playing, accent }: { playing: boolean; accent: string }) {
  const hair = '#7a4a52'
  const phones = `rgb(${accent})`
  return (
    <g className={playing ? undefined : 'st-doze'}>
      {/* Hoodie. */}
      <path d="M33 121 Q33 93 60 90 Q87 93 87 121 Z" fill="#f6c177" {...LINE} />
      <path d="M45 96 Q60 105 75 96" fill="none" stroke="#dc9c4f" strokeWidth={3} strokeLinecap="round" />
      <path d="M54 101 L53 111 M66 101 L67 111" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <Bob playing={playing} pivot="60px 92px">
        <path d="M24 56 Q24 16 60 16 Q96 16 96 56 L97 88 Q90 95 82 88 L80 68 L40 68 L38 88 Q30 95 23 88 Z" fill={hair} {...LINE} />
        <rect x="54" y="78" width="12" height="14" fill="#f3c9b4" />
        <ellipse cx="60" cy="60" rx="26" ry="24" fill="#ffe3d3" {...LINE} />
        {/* Bangs, then a shine across them. */}
        <path
          d="M33 54 Q33 24 60 24 Q87 24 87 54 Q83 46 79 50 Q76 40 70 47 Q66 37 60 46 Q54 37 50 47 Q44 40 41 50 Q37 46 33 54 Z"
          fill={hair}
          {...LINE}
        />
        <path d="M44 32 Q52 27 61 28" fill="none" stroke="#a8707a" strokeWidth={2.4} strokeLinecap="round" />
        <Eyes playing={playing} left={49} right={71} y={62} iris="#8a5cc7" />
        <Blush left={42} right={78} y={70} />
        {playing ? (
          <path d="M56.5 71.5 Q60 75.5 63.5 71.5 Z" fill="#c0546a" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
        ) : (
          <ellipse cx="60" cy="73" rx="1.8" ry="1.4" fill="#c0546a" />
        )}
        {/* Headphones, in the scene's colour. */}
        <path d="M29 56 Q27 11 60 11 Q93 11 91 56" fill="none" stroke={INK} strokeWidth={7.4} strokeLinecap="round" />
        <path d="M29 56 Q27 11 60 11 Q93 11 91 56" fill="none" stroke={phones} strokeWidth={4.2} strokeLinecap="round" />
        <rect x="19" y="46" width="14" height="23" rx="6" fill={phones} {...LINE} />
        <rect x="87" y="46" width="14" height="23" rx="6" fill={phones} {...LINE} />
        <rect x="22.5" y="50.5" width="5" height="14" rx="2.5" fill="white" opacity="0.45" />
        <rect x="92.5" y="50.5" width="5" height="14" rx="2.5" fill="white" opacity="0.45" />
      </Bob>
      <Floaters playing={playing} x={98} y={30} />
    </g>
  )
}

/** Pink twin tails with bows, sparkly eyes, a sailor collar and a juice box she sips from. */
function JuiceGirl({ playing }: { playing: boolean }) {
  const hair = '#ffb3d1'
  const shade = '#f08bb8'
  const bow = '#ff5c8a'
  const tailLeft = 'M31 40 Q11 52 15 76 Q19 96 11 106 Q31 102 33 80 Q36 60 39 46 Z'
  const tailRight = 'M89 40 Q109 52 105 76 Q101 96 109 106 Q89 102 87 80 Q84 60 81 46 Z'
  return (
    <g className={playing ? undefined : 'st-doze'}>
      {/* Twin tails, behind everything. */}
      <path d={tailLeft} fill={hair} {...LINE} />
      <path d={tailRight} fill={hair} {...LINE} />
      <path d="M22 66 Q20 82 22 94 M98 66 Q100 82 98 94" fill="none" stroke={shade} strokeWidth={2.2} strokeLinecap="round" />
      {/* Sailor top: white with a navy collar and a red bow. */}
      <path d="M34 121 Q34 93 60 90 Q86 93 86 121 Z" fill="#f6f3ff" {...LINE} />
      <path d="M38 96 Q48 91 60 99 Q72 91 82 96 L79 106 Q68 101 60 109 Q52 101 41 106 Z" fill="#4b5bb0" {...LINE} />
      <path d="M44 100 Q52 99 60 105 Q68 99 76 100" fill="none" stroke="white" strokeWidth={1.4} strokeLinecap="round" opacity={0.85} />
      <Bob playing={playing} pivot="60px 92px">
        <path d="M26 56 Q26 18 60 18 Q94 18 94 56 L94 74 Q86 80 80 72 L40 72 Q34 80 26 74 Z" fill={hair} {...LINE} />
        <rect x="54" y="78" width="12" height="14" fill="#f6c9b4" />
        <ellipse cx="60" cy="60" rx="26" ry="24" fill="#ffe7d9" {...LINE} />
        {/* Bangs with a little centre parting, and locks framing the face. */}
        <path
          d="M33 55 Q33 24 60 24 Q87 24 87 55 Q83 46 78 51 Q75 41 68 48 Q64 38 61 46 L59 46 Q56 38 52 48 Q45 41 42 51 Q37 46 33 55 Z"
          fill={hair}
          {...LINE}
        />
        <path d="M34 50 Q29 66 34 80 Q39 70 39 56 Z M86 50 Q91 66 86 80 Q81 70 81 56 Z" fill={hair} {...LINE} />
        <path d="M43 31 Q51 26 59 27" fill="none" stroke="#ffe3f0" strokeWidth={2.6} strokeLinecap="round" />
        {/* Bows where the tails are tied. */}
        {[29, 91].map((x) => (
          <g key={x}>
            <path d={`M${x} 40 L${x - 11} 32 Q${x - 14} 40 ${x - 11} 48 Z M${x} 40 L${x + 11} 32 Q${x + 14} 40 ${x + 11} 48 Z`} fill={bow} {...LINE} />
            <circle cx={x} cy={40} r="3.6" fill="#d63c6b" stroke={INK} strokeWidth={2} />
          </g>
        ))}
        {playing ? (
          <>
            {[49, 71].map((x) => (
              <g key={x} className="st-blink">
                <ellipse cx={x} cy={62} rx="5" ry="6.6" fill="#3a2550" />
                <ellipse cx={x} cy={64.6} rx="3.8" ry="3.4" fill="#9b6bff" />
                <ellipse cx={x} cy={66.4} rx="2.4" ry="1.5" fill="#d2b8ff" />
                <circle cx={x - 1.8} cy={59.4} r="2.2" fill="white" />
                <circle cx={x + 2} cy={63.2} r="1" fill="white" />
              </g>
            ))}
            {/* Lashes flicking out at the corners. */}
            <path d="M43.6 58 L41 56 M76.4 58 L79 56" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
          </>
        ) : (
          <path d="M44 63 Q49 66.5 54 63 M66 63 Q71 66.5 76 63" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        )}
        <Blush left={41} right={79} y={71} />
        {/* The shy little "///" on her cheeks. */}
        <path d="M38.5 72.5 L40 69.5 M41.5 72.5 L43 69.5 M77 72.5 L78.5 69.5 M80 72.5 L81.5 69.5" stroke="#e8708f" strokeWidth={1.1} strokeLinecap="round" />
        {/* "ω" */}
        <path d="M55.5 71 Q57.75 74.5 60 71 Q62.25 74.5 64.5 71" fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        {/* The juice box, held up to sip from; it rises a little with each sip. */}
        <g className={playing ? 'st-sip' : undefined}>
          {/* A bendy straw from the box up to her lips. */}
          <path d="M73 82 L73 74 Q73 71.5 70.5 72 L63.5 73" fill="none" stroke={INK} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M73 82 L73 74 Q73 71.5 70.5 72 L63.5 73" fill="none" stroke="#ff7b7b" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M64 84 L68 80 L84 80 L80 84 Z" fill="#b8f09a" {...LINE} />
          <rect x="64" y="84" width="16" height="21" rx="1.5" fill="#8fdc6a" {...LINE} />
          <path d="M80 84 L84 80 L84 101 L80 105 Z" fill="#5eb546" {...LINE} />
          <rect x="66.5" y="89.5" width="11" height="9" rx="1.5" fill="#ffd166" />
          <circle cx="72" cy="94" r="2.6" fill="#ff9f43" />
          <ellipse cx="63" cy="96" rx="4" ry="3.4" fill="#ffe7d9" {...LINE} />
          <ellipse cx="83.5" cy="94" rx="3.6" ry="3.2" fill="#ffe7d9" {...LINE} />
        </g>
      </Bob>
      <Floaters playing={playing} x={98} y={28} />
    </g>
  )
}

function Cat({ playing }: { playing: boolean }) {
  const fur = '#f4a259'
  const cream = '#fde4c4'
  const tail = 'M82 110 Q106 106 104 84 Q103 72 95 70'
  return (
    <g className={playing ? undefined : 'st-doze'}>
      <g className="st-swish" style={{ transformOrigin: '84px 108px' }}>
        <path d={tail} fill="none" stroke={INK} strokeWidth={11.4} strokeLinecap="round" />
        <path d={tail} fill="none" stroke={fur} strokeWidth={7} strokeLinecap="round" />
      </g>
      <ellipse cx="60" cy="98" rx="27" ry="21" fill={fur} {...LINE} />
      <ellipse cx="60" cy="102" rx="14" ry="14" fill={cream} />
      <ellipse cx="49" cy="117" rx="8" ry="4.5" fill={cream} {...LINE} />
      <ellipse cx="71" cy="117" rx="8" ry="4.5" fill={cream} {...LINE} />
      <Bob playing={playing} pivot="60px 86px">
        <path d="M35 52 L37 21 L57 40 Z" fill={fur} {...LINE} />
        <path d="M85 52 L83 21 L63 40 Z" fill={fur} {...LINE} />
        <path d="M39.5 46 L40.5 29 L51.5 40 Z" fill="#ffb3c1" />
        <path d="M80.5 46 L79.5 29 L68.5 40 Z" fill="#ffb3c1" />
        <ellipse cx="60" cy="62" rx="31" ry="25" fill={fur} {...LINE} />
        <path d="M60 38 L60 46 M53 39.5 L55 46 M67 39.5 L65 46" stroke="#d9822b" strokeWidth={2.4} strokeLinecap="round" />
        <ellipse cx="60" cy="72" rx="12" ry="8" fill={cream} />
        <Eyes playing={playing} left={47} right={73} y={62} iris="#7cc47f" />
        <Blush left={39} right={81} y={71} />
        <path d="M57.5 68.5 L62.5 68.5 L60 71.5 Z" fill="#ff8fa3" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
        <path d="M55 73.5 Q57.5 76.5 60 73.5 Q62.5 76.5 65 73.5" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
        <path d="M37 69 L24 66 M37 73.5 L24 75.5 M83 69 L96 66 M83 73.5 L96 75.5" stroke={INK} strokeWidth={1.3} strokeLinecap="round" />
      </Bob>
      <Floaters playing={playing} x={94} y={34} />
    </g>
  )
}

function Dog({ playing }: { playing: boolean }) {
  const fur = '#e8a25c'
  const cream = '#fff4e6'
  const tail = 'M82 100 Q100 98 98 82 Q96 72 86 76 Q81 80 88 86'
  return (
    <g className={playing ? undefined : 'st-doze'}>
      <g className={playing ? 'st-wag' : 'st-swish'} style={{ transformOrigin: '82px 100px' }}>
        <path d={tail} fill="none" stroke={INK} strokeWidth={11.4} strokeLinecap="round" />
        <path d={tail} fill="none" stroke={fur} strokeWidth={7} strokeLinecap="round" />
      </g>
      <ellipse cx="60" cy="99" rx="26" ry="20" fill={fur} {...LINE} />
      <ellipse cx="60" cy="102" rx="13" ry="14" fill={cream} />
      <ellipse cx="49" cy="117" rx="8" ry="4.5" fill={cream} {...LINE} />
      <ellipse cx="71" cy="117" rx="8" ry="4.5" fill={cream} {...LINE} />
      <Bob playing={playing} pivot="60px 88px">
        <path d="M34 50 Q35 30 39 20 Q50 28 56 38 Z" fill={fur} {...LINE} />
        <path d="M86 50 Q85 30 81 20 Q70 28 64 38 Z" fill={fur} {...LINE} />
        <path d="M39 44 L41 28 L51 38 Z" fill="#c9773a" />
        <path d="M81 44 L79 28 L69 38 Z" fill="#c9773a" />
        <ellipse cx="60" cy="62" rx="31" ry="26" fill={fur} {...LINE} />
        {/* The pale cheeks and muzzle, and the little eyebrow spots. */}
        <path d="M33 64 Q36 87 60 87 Q84 87 87 64 Q77 73 60 71 Q43 73 33 64 Z" fill={cream} />
        <ellipse cx="47" cy="52.5" rx="3.2" ry="2" fill={cream} />
        <ellipse cx="73" cy="52.5" rx="3.2" ry="2" fill={cream} />
        <Eyes playing={playing} left={47} right={73} y={61} />
        <Blush left={39} right={81} y={71} />
        <ellipse cx="60" cy="70" rx="4.2" ry="3" fill="#2d2238" />
        <path d="M60 73 L60 75.5 M55 76 Q57.5 78.5 60 75.5 Q62.5 78.5 65 76" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
        {playing && <path d="M57.6 77.4 Q57.6 84 60 84 Q62.4 84 62.4 77.4 Z" fill="#ff7f96" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />}
      </Bob>
      <Floaters playing={playing} x={94} y={32} />
    </g>
  )
}

function Cocoa({ playing, accent }: { playing: boolean; accent: string }) {
  const mug = '#e8806e'
  const handle = 'M84 70 Q102 70 100 88 Q98 102 82 100'
  return (
    <g>
      {/* The scene's light, glowing off the steam. */}
      <ellipse cx="58" cy="42" rx="26" ry="18" fill={`rgb(${accent})`} opacity="0.22" style={{ filter: 'blur(9px)' }} />
      {[46, 58, 70].map((x, index) => (
        <path
          key={x}
          className="st-steam"
          d={`M${x} 46 Q${x - 4} 38 ${x} 31 Q${x + 4} 24 ${x} 16`}
          fill="none"
          stroke="white"
          strokeOpacity={0.75}
          strokeWidth={3}
          strokeLinecap="round"
          style={{ animationDelay: `${-index * 1.1}s` }}
        />
      ))}
      <ellipse cx="58" cy="114" rx="38" ry="6" fill="#ead7bf" {...LINE} />
      <path d={handle} fill="none" stroke={INK} strokeWidth={10.4} strokeLinecap="round" />
      <path d={handle} fill="none" stroke={mug} strokeWidth={6} strokeLinecap="round" />
      <path d="M30 58 L86 58 L82 104 Q81 112 72 112 L44 112 Q35 112 34 104 Z" fill={mug} {...LINE} />
      <path d="M32.6 74 L84.4 74" stroke="#f6b8a8" strokeWidth={4} />
      <ellipse cx="58" cy="58" rx="28" ry="7" fill="#7a4632" {...LINE} />
      <rect x="44" y="51" width="9" height="7" rx="2" fill="#fff6f0" stroke={INK} strokeWidth={1.4} transform="rotate(-12 48 55)" />
      <rect x="59" y="52" width="9" height="7" rx="2" fill="#ffe1ea" stroke={INK} strokeWidth={1.4} transform="rotate(10 63 55)" />
      <Eyes playing={playing} left={48} right={68} y={88} />
      <Blush left={42} right={74} y={95} />
      <path d="M55 94 Q58 97 61 94" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
    </g>
  )
}
