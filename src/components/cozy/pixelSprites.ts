/**
 * Pixel-art companions, 32×32. Each layer is a grid of palette letters ("." is
 * empty); a `mirror` layer is drawn again flipped across the sprite's centre,
 * so a face is drawn once as its left half. `@accent` in a palette is the
 * scene's light colour.
 */

export interface PixelLayer {
  rows: string[]
  x?: number
  y?: number
  /** Also drawn flipped across the vertical centre of the sprite. */
  mirror?: boolean
  /** Shown only while music plays, or only while paused (asleep). */
  when?: 'playing' | 'paused'
  /** An animation class (frame swaps, blinks, sips) from styles.css. */
  className?: string
}

export interface PixelSprite {
  size: number
  palette: Record<string, string>
  layers: PixelLayer[]
}

const INK = '#3b2a33'

/** The eyes shut: a sleepy curve, drawn over the open eyes. */
const SHUT_EYES = ['sss', 'sss', 'ksk', 'sks']

const JUICE_GIRL: PixelSprite = {
  size: 32,
  palette: {
    k: INK,
    h: '#ffb7d5',
    H: '#f08bb8',
    l: '#ffe3f0',
    r: '#ff5c8a',
    R: '#d63c6b',
    s: '#ffe7d9',
    e: '#3a2550',
    i: '#8f63ff',
    j: '#c9a8ff',
    w: '#ffffff',
    b: '#ff9cbc',
    c: '#f6f3ff',
    C: '#d4cdef',
    n: '#4b5bb0',
    y: '#8fdc6a',
    Y: '#5eb546',
    o: '#ffd166',
    p: '#ff7b7b'
  },
  layers: [
    {
      mirror: true,
      rows: [
        '................',
        '..........kkkkkk',
        '........kkhhhhhh',
        '.......khhhlllhh',
        '......khhhllhhhh',
        '.kk..khhhhhhhhhh',
        'krrrkkhhhhhhhhhh',
        'krRrrkhhhhhhhhhh',
        '.krrkkhhhhhhhhhh',
        '.khhkkhhhhhhhhhh',
        'khhhkkhhhhhhhhhh',
        'khhHkkhhshhhshhs',
        'khhHkkhhsshssshs',
        'khhhkkhhsskkksss',
        'khhHkkhhssweesss',
        'khhHkkhhsseiesss',
        'khhhkkhhssijisss',
        'khhHkkhhbbsssksk',
        'khhHkkhhssssssks',
        'khhhk.kkssssssss',
        '.khHk...kkkkkkkk',
        '.khhk.......ksss',
        '.khk..kkkknnnnss',
        '..k..kcccnnnnnns',
        '.....kcccCnnnnrr',
        '.....kccccccnrRr',
        '.....kcccccccccc',
        '.....kCccccccccc',
        '.....kCccccccccc',
        '.....kCCcccccccc',
        '.....kCCCccccccc',
        '.....kkkkkkkkkkk'
      ]
    },
    { x: 10, y: 13, mirror: true, when: 'paused', rows: SHUT_EYES },
    { x: 10, y: 13, mirror: true, when: 'playing', className: 'st-px-blink', rows: SHUT_EYES },
    {
      x: 17,
      y: 18,
      className: 'st-px-sip',
      rows: [
        '.p.......',
        '..p......',
        '..kpkkk..',
        '..kyyyk..',
        'kskoooksk',
        'kskoooksk',
        '..kyyYk..',
        '..kyYYk..',
        '..kkkkk..'
      ]
    }
  ]
}

const HEADPHONE_GIRL: PixelSprite = {
  size: 32,
  palette: {
    k: INK,
    h: '#7a4a52',
    H: '#5e363e',
    l: '#a8707a',
    s: '#ffe3d3',
    e: '#2d2238',
    i: '#8a5cc7',
    j: '#c3a2ef',
    w: '#ffffff',
    b: '#ff9fb0',
    c: '#f6c177',
    C: '#dc9c4f',
    d: INK,
    p: '@accent',
    P: '#ffffff'
  },
  layers: [
    {
      mirror: true,
      rows: [
        '................',
        '..........kkkkkk',
        '........kkhhhhhh',
        '.......khhhlllhh',
        '......khhhllhhhh',
        '.....khhhhhhhhhh',
        '....khhhhhhhhhhh',
        '...khhhhhhhhhhhh',
        '...khhhhhhhhhhhh',
        '...khhhhhhhhhhhh',
        '...khhhhhhhhhhhh',
        '...khHhhshhhshhs',
        '...khHhhsshssshs',
        '...khhhhsskkksss',
        '...khHhhssweesss',
        '...khHhhsseiesss',
        '...khhhhssijisss',
        '...khHhhbbssssks',
        '...khHhhsssssssk',
        '...khhkkssssssss',
        '...khH..kkkkkkkk',
        '...khh......ksss',
        '...khHkkkkCCCCss',
        '....kccccccCCCCC',
        '....kcccccccCcdc',
        '....kcccccccccdc',
        '....kcccccccccdc',
        '....kCcccccccccc',
        '....kCcccccccccc',
        '....kCCccccccccc',
        '....kCCCcccccccc',
        '....kkkkkkkkkkkk'
      ]
    },
    { x: 10, y: 13, mirror: true, when: 'paused', rows: SHUT_EYES },
    { x: 10, y: 13, mirror: true, when: 'playing', className: 'st-px-blink', rows: SHUT_EYES },
    // Headphones over the head, in the scene's colour.
    {
      x: 4,
      y: 0,
      mirror: true,
      rows: ['......kkkkkk', '....kkpppppp', '...kppkkkkkk', '..kpk.......', '.kpk........', '.kpk........', 'kpk.........']
    },
    {
      x: 1,
      y: 7,
      mirror: true,
      rows: ['.kkkk.', 'kppppk', 'kpPPpk', 'kpPPpk', 'kpPPpk', 'kpPPpk', 'kppppk', '.kkkk.']
    }
  ]
}

const CAT: PixelSprite = {
  size: 32,
  palette: {
    k: INK,
    o: '#f4a259',
    O: '#d9822b',
    c: '#fde4c4',
    p: '#ffb3c1',
    e: '#2d2433',
    g: '#7cc47f',
    w: '#ffffff',
    n: '#ff8fa3',
    b: '#ff9fb0'
  },
  layers: [
    {
      mirror: true,
      rows: [
        '................',
        '................',
        '................',
        '.....k..........',
        '.....kk.........',
        '.....kok........',
        '.....kpok.......',
        '.....kppok......',
        '....koppookkkkkk',
        '...kooooooooOoOo',
        '..kooooooooooOoO',
        '..kooooooooooooo',
        '.koooooooooooooo',
        '.koooookkkoooooo',
        '.koooooweeoooooo',
        '.koooooegeoooooo',
        'kkoooooeggoooooo',
        '.kobbooooocccccn',
        'kkooooooocccckck',
        '.koooooocccccckc',
        '..kooooocccccccc',
        '...kkooocccccccc',
        '.....kkkkkkkkkkk',
        '....kooooooccccc',
        '...koooooooccccc',
        '...kOooooooccccc',
        '...kOOoooooccccc',
        '...kOooooooccccc',
        '...koooooooccccc',
        '...koooooooccccc',
        '...kookcccckcccc',
        '...kkkkkkkkkkkkk'
      ]
    },
    { x: 7, y: 13, mirror: true, when: 'paused', rows: ['ooo', 'ooo', 'kok', 'oko'] },
    { x: 7, y: 13, mirror: true, when: 'playing', className: 'st-px-blink', rows: ['ooo', 'ooo', 'kok', 'oko'] },
    // The tail, swishing between two poses.
    {
      x: 28,
      y: 19,
      className: 'st-px-a',
      rows: ['..kk', '.kok', '.kok', 'kok.', 'kok.', 'kOk.', 'kok.', 'kok.', 'kOk.', 'kk..']
    },
    {
      x: 28,
      y: 19,
      className: 'st-px-b',
      rows: ['kk..', 'kok.', 'kok.', 'kok.', 'kOk.', 'kok.', 'kok.', 'kok.', 'kOk.', 'kk..']
    }
  ]
}

const DOG: PixelSprite = {
  size: 32,
  palette: {
    k: INK,
    o: '#e8a25c',
    d: '#c9773a',
    c: '#fff4e6',
    e: '#2d2238',
    w: '#ffffff',
    N: '#2d2238',
    b: '#ff9fb0',
    t: '#ff7f96'
  },
  layers: [
    {
      mirror: true,
      rows: [
        '................',
        '................',
        '................',
        '......k.........',
        '.....kok........',
        '.....kodk.......',
        '....kodok.......',
        '....kodook......',
        '....koddookkkkkk',
        '...koooooooooooo',
        '..kooooooooooooo',
        '..koooooccoooooo',
        '.koooooooooooooo',
        '.koooooooweooooo',
        '.koooooooeeooooo',
        '.koooooooeeooooo',
        '.kccoooooooooooo',
        '.kcbbcccccccccNN',
        '.kcccccccccccccN',
        '..kcccccccccckck',
        '..kccccccccccckc',
        '...kkccccccccccc',
        '.....kkkkkkkkkkk',
        '....kooooooccccc',
        '...koooooooccccc',
        '...koooooooccccc',
        '...koooooooccccc',
        '...koooooooccccc',
        '...koooooooccccc',
        '...koooooooccccc',
        '...kookcccckcccc',
        '...kkkkkkkkkkkkk'
      ]
    },
    { x: 9, y: 13, mirror: true, when: 'paused', rows: ['oo', 'oo', 'kk'] },
    { x: 9, y: 13, mirror: true, when: 'playing', className: 'st-px-blink', rows: ['oo', 'oo', 'kk'] },
    { x: 15, y: 20, mirror: true, when: 'playing', rows: ['t', 't'] },
    // The curled tail, wagging (fast while playing).
    { x: 27, y: 17, className: 'st-px-a', rows: ['.kkk.', 'kocok', 'kokck', '.kook', '..kok', '..kk.'] },
    { x: 28, y: 16, className: 'st-px-b', rows: ['.kkk.', 'kocok', 'kokck', '.kook', '..kok', '..kk.'] }
  ]
}

const COCOA: PixelSprite = {
  size: 32,
  palette: {
    k: INK,
    M: '#e8806e',
    L: '#f6b8a8',
    B: '#7a4632',
    m: '#fff6f0',
    S: '#ead7bf',
    e: '#2d2238',
    w: '#ffffff',
    b: '#ff9fb0',
    W: 'rgba(255,255,255,0.7)'
  },
  layers: [
    {
      mirror: true,
      rows: [
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '......kkkkkkkkkk',
        '.....kBBBmmBBBBB',
        '.....kBBmmmmBBBB',
        '.....kkkkkkkkkkk',
        '.....kMMMMMMMMMM',
        '.....kMMMMMMMMMM',
        '.....kLLLLLLLLLL',
        '.....kMMMMMMMMMM',
        '.....kMMMMMMMMMM',
        '.....kMMMweMMMMM',
        '.....kMMMeeMMMMM',
        '.....kMbbMMMMMkM',
        '.....kMMMMMMMMMk',
        '.....kMMMMMMMMMM',
        '.....kMMMMMMMMMM',
        '......kMMMMMMMMM',
        '......kMMMMMMMMM',
        '.......kkkkkkkkk',
        '..kSSSSSSSSSSSSS',
        '...kkkkkkkkkkkkk',
        '................',
        '................'
      ]
    },
    { x: 9, y: 19, mirror: true, when: 'paused', rows: ['MM', 'kk'] },
    { x: 9, y: 19, mirror: true, when: 'playing', className: 'st-px-blink', rows: ['MM', 'kk'] },
    { x: 27, y: 15, rows: ['kkkk', 'MMMk', 'kkMk', '.kMk', '.kMk', 'kkMk', 'MMMk', 'kkkk'] },
    // Steam, curling up in two frames.
    {
      x: 8,
      y: 2,
      className: 'st-px-a',
      rows: ['.W.....W.....W..', 'W.....W.....W...', '.W.....W.....W..', '..W.....W.....W.', '.W.....W.....W..', 'W.....W.....W...', '.W.....W.....W..']
    },
    {
      x: 8,
      y: 2,
      className: 'st-px-b',
      rows: ['W.....W.....W...', '.W.....W.....W..', '..W.....W.....W.', '.W.....W.....W..', 'W.....W.....W...', '.W.....W.....W..', '..W.....W.....W.']
    }
  ]
}

export const PIXEL_SPRITES = {
  girl: HEADPHONE_GIRL,
  juice: JUICE_GIRL,
  cat: CAT,
  dog: DOG,
  cocoa: COCOA
} as const

/** One run of same-coloured pixels in a row: drawn as a single rect. */
export interface PixelRun {
  x: number
  y: number
  width: number
  colour: string
}

/** The coloured runs of a layer, plus its mirror image when it has one. */
export function layerRuns(sprite: PixelSprite, layer: PixelLayer, accent: string): PixelRun[] {
  const runs: PixelRun[] = []
  const x0 = layer.x ?? 0
  const y0 = layer.y ?? 0
  const colourOf = (key: string): string | null => {
    const value = sprite.palette[key]
    if (!value) return null
    return value === '@accent' ? `rgb(${accent})` : value
  }
  const addRow = (row: string, x: number, y: number): void => {
    let start = 0
    while (start < row.length) {
      let end = start + 1
      while (end < row.length && row[end] === row[start]) end++
      const colour = colourOf(row[start])
      if (colour) runs.push({ x: x + start, y, width: end - start, colour })
      start = end
    }
  }
  layer.rows.forEach((row, index) => {
    addRow(row, x0, y0 + index)
    if (layer.mirror) addRow([...row].reverse().join(''), sprite.size - x0 - row.length, y0 + index)
  })
  return runs
}
