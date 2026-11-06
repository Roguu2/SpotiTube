/**
 * Cozy mode's scenes: a light, a tint and something drifting across the screen,
 * picked from what's playing (its artist's genres, else words in its title) or
 * chosen by hand.
 */

export type SceneId = 'lamplight' | 'rain' | 'neon' | 'campfire' | 'city' | 'bloom' | 'starlight'
export type SceneChoice = SceneId | 'auto'
export type Particles = 'bokeh' | 'rain' | 'sparks' | 'stars' | 'petals'

export interface Scene {
  id: SceneId
  label: string
  /** What it suits, for the picker. */
  hint: string
  /** "r g b" for text accents. */
  accent: string
  /** "r g b" of the light: the glow under the picture and the drifting lights. */
  glow: string
  /** A second light colour, alternating with `glow`. */
  glow2?: string
  /** Colour grade over the backdrop (soft-light blended). */
  tint: string
  particles: Particles
}

export const SCENES: Record<SceneId, Scene> = {
  lamplight: {
    id: 'lamplight',
    label: 'Lamplight',
    hint: 'Soul, R&B, anything',
    accent: '255 222 186',
    glow: '255 170 100',
    tint: 'linear-gradient(170deg,rgba(255,196,140,0.10),rgba(255,140,80,0.08) 55%,rgba(120,60,30,0.18))',
    particles: 'bokeh'
  },
  rain: {
    id: 'rain',
    label: 'Rainy window',
    hint: 'Lo-fi, jazz, chill',
    accent: '196 214 255',
    glow: '130 160 230',
    tint: 'linear-gradient(170deg,rgba(130,160,230,0.16),rgba(70,90,150,0.10) 55%,rgba(20,30,70,0.28))',
    particles: 'rain'
  },
  neon: {
    id: 'neon',
    label: 'Neon club',
    hint: 'House, techno, dance',
    accent: '255 184 240',
    glow: '255 70 200',
    glow2: '70 210 255',
    tint: 'linear-gradient(160deg,rgba(255,60,200,0.16),rgba(90,60,255,0.10) 55%,rgba(0,190,255,0.16))',
    particles: 'bokeh'
  },
  campfire: {
    id: 'campfire',
    label: 'Campfire',
    hint: 'Rock, metal, punk',
    accent: '255 196 150',
    glow: '255 110 50',
    tint: 'linear-gradient(175deg,rgba(255,140,70,0.10),rgba(220,80,30,0.12) 60%,rgba(110,25,5,0.30))',
    particles: 'sparks'
  },
  city: {
    id: 'city',
    label: 'City night',
    hint: 'Hip hop, rap, trap',
    accent: '206 190 255',
    glow: '150 100 255',
    glow2: '60 200 210',
    tint: 'linear-gradient(170deg,rgba(130,90,255,0.14),rgba(40,40,110,0.12) 55%,rgba(0,150,160,0.16))',
    particles: 'stars'
  },
  bloom: {
    id: 'bloom',
    label: 'Spring bloom',
    hint: 'Pop, indie, folk, acoustic',
    accent: '255 208 222',
    glow: '255 150 185',
    glow2: '255 205 150',
    tint: 'linear-gradient(165deg,rgba(255,170,200,0.14),rgba(255,200,170,0.10) 55%,rgba(130,60,90,0.20))',
    particles: 'petals'
  },
  starlight: {
    id: 'starlight',
    label: 'Starlight',
    hint: 'Classical, piano, ambient',
    accent: '206 222 255',
    glow: '160 185 255',
    tint: 'linear-gradient(175deg,rgba(120,150,255,0.12),rgba(40,50,120,0.14) 55%,rgba(5,10,40,0.32))',
    particles: 'stars'
  }
}

export const SCENE_LIST: Scene[] = Object.values(SCENES)

export function isSceneChoice(value: unknown): value is SceneChoice {
  return value === 'auto' || (typeof value === 'string' && Object.hasOwn(SCENES, value))
}

/**
 * The first rule matching a genre wins, so the order settles overlaps:
 * "lofi hip hop" is rain before it is hip hop, "post-rock" starlight before rock.
 */
const RULES: [SceneId, RegExp][] = [
  ['rain', /lo-?fi|chill|jazz|blues|downtempo|trip.?hop|bossa|study|sleep|\brain\b|\bsad\b/],
  ['starlight', /classical|piano|orchestr|ambient|soundtrack|\bscore\b|new age|post.?rock|instrumental|lullab/],
  ['neon', /house|techno|trance|edm|electro|dance|disco|club|dubstep|drum.?(and|n|&).?bass|\bdnb\b|synth|hardstyle|phonk|garage|klubow|vixa|remix|\bmix\b/],
  ['city', /hip.?hop|\brap\b|trap|drill|grime|boom.?bap/],
  ['campfire', /rock|metal|punk|grunge|hardcore|\bemo\b|shoegaze/],
  ['bloom', /pop|folk|acoustic|country|singer.?songwriter|indie|bluegrass|unplugged/],
  ['lamplight', /soul|r&b|rnb|funk|motown|gospel|reggae|latin/]
]

function match(text: string): SceneId | null {
  const lower = text.toLowerCase()
  for (const [scene, rule] of RULES) if (rule.test(lower)) return scene
  return null
}

/** What the scene was chosen from: a genre tag, a word in the title, or nothing. */
export interface SceneGuess {
  scene: SceneId
  because: string | null
}

/** Genres in their order of agreement, then the title, then lamplight. */
export function guessScene(genres: string[], title: string): SceneGuess {
  for (const genre of genres) {
    const scene = match(genre)
    if (scene) return { scene, because: genre }
  }
  const fromTitle = match(title)
  if (fromTitle) return { scene: fromTitle, because: null }
  return { scene: 'lamplight', because: genres[0] ?? null }
}
