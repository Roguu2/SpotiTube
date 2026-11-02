import { makePlaylistId, makeTrackId, type SourceId, type UnifiedPlaylist, type UnifiedTrack } from '@core/types'
import { gradientArtwork } from './artwork'

/** [title, artists, album, duration "m:ss"] */
type TrackSpec = [string, string[], string, string]

interface PlaylistSpec {
  slug: string
  source: Extract<SourceId, 'spotify' | 'ytmusic'>
  name: string
  description: string
  owner: string
  tracks: TrackSpec[]
}

const PLAYLISTS: PlaylistSpec[] = [
  {
    slug: 'sp-night-drive',
    source: 'spotify',
    name: 'Night Drive Synthwave',
    description: 'Neon-lit retro synths for empty highways after midnight.',
    owner: 'Spotify',
    tracks: [
      ['Nightcall', ['Kavinsky'], 'OutRun', '4:18'],
      ['Midnight City', ['M83'], "Hurry Up, We're Dreaming", '4:03'],
      ['Blinding Lights', ['The Weeknd'], 'After Hours', '3:20'],
      ['Instant Crush', ['Daft Punk', 'Julian Casablancas'], 'Random Access Memories', '5:37'],
      ['Resonance', ['HOME'], 'Odyssey', '3:32'],
      ['A Real Hero', ['College', 'Electric Youth'], 'Drive (Original Motion Picture Soundtrack)', '4:27'],
      ['Tech Noir', ['Gunship'], 'Gunship', '4:57'],
      ['Turbo Killer', ['Carpenter Brut'], 'Leather Teeth', '3:21']
    ]
  },
  {
    slug: 'sp-indie-essentials',
    source: 'spotify',
    name: 'Indie Essentials',
    description: 'The guitar-and-synth indie records that defined a generation.',
    owner: 'Spotify',
    tracks: [
      ['Do I Wanna Know?', ['Arctic Monkeys'], 'AM', '4:32'],
      ['Electric Feel', ['MGMT'], 'Oracular Spectacular', '3:49'],
      ['Mr. Brightside', ['The Killers'], 'Hot Fuss', '3:42'],
      ['Somebody Else', ['The 1975'], 'I like it when you sleep, for you are so beautiful yet so unaware of it', '5:47'],
      ['Feels Like We Only Go Backwards', ['Tame Impala'], 'Lonerism', '3:12'],
      ['Take Me Out', ['Franz Ferdinand'], 'Franz Ferdinand', '3:57'],
      ['Ribs', ['Lorde'], 'Pure Heroine', '4:18'],
      ['Little Dark Age', ['MGMT'], 'Little Dark Age', '4:59']
    ]
  },
  {
    slug: 'sp-throwback-classics',
    source: 'spotify',
    name: 'Throwback Classics',
    description: 'Timeless hits from the 70s and 80s.',
    owner: 'Spotify',
    tracks: [
      ['Billie Jean', ['Michael Jackson'], 'Thriller', '4:54'],
      ['Take On Me', ['a-ha'], 'Hunting High and Low', '3:45'],
      ['Africa', ['TOTO'], 'Toto IV', '4:55'],
      ["Don't Stop Me Now", ['Queen'], 'Jazz', '3:29'],
      ['Sweet Dreams (Are Made of This)', ['Eurythmics'], 'Sweet Dreams (Are Made of This)', '3:36'],
      ['Superstition', ['Stevie Wonder'], 'Talking Book', '4:26'],
      ['Everybody Wants To Rule The World', ['Tears For Fears'], 'Songs From The Big Chair', '4:11'],
      ['September', ['Earth, Wind & Fire'], 'The Best Of Earth, Wind & Fire, Vol. 1', '3:35']
    ]
  },
  {
    slug: 'yt-late-night-chill',
    source: 'ytmusic',
    name: 'Late Night Chill',
    description: 'Smooth grooves and mellow R&B for winding down.',
    owner: 'YouTube Music',
    tracks: [
      ['Get Lucky (feat. Pharrell Williams and Nile Rodgers)', ['Daft Punk'], 'Random Access Memories', '6:09'],
      ['Redbone', ['Childish Gambino'], '"Awaken, My Love!"', '5:26'],
      ['Sunflower', ['Post Malone', 'Swae Lee'], 'Spider-Man: Into the Spider-Verse', '2:38'],
      ['Space Song', ['Beach House'], 'Depression Cherry', '5:20'],
      ['Pink + White', ['Frank Ocean'], 'Blonde', '3:04'],
      ['Electric', ['Alina Baraz', 'Khalid'], 'The Color of You', '3:46'],
      ['Best Part', ['Daniel Caesar', 'H.E.R.'], 'Freudian', '3:29'],
      ['Breathe', ['Télépopmusik'], 'Genetic World', '4:39']
    ]
  },
  {
    slug: 'yt-rock-anthems',
    source: 'ytmusic',
    name: 'Rock Anthems',
    description: 'Stadium-sized riffs and sing-along choruses.',
    owner: 'YouTube Music',
    tracks: [
      ['Bohemian Rhapsody', ['Queen'], 'A Night At The Opera', '5:55'],
      ['Smells Like Teen Spirit', ['Nirvana'], 'Nevermind', '5:01'],
      ['Seven Nation Army', ['The White Stripes'], 'Elephant', '3:51'],
      ['Back In Black', ['AC/DC'], 'Back In Black', '4:15'],
      ["Sweet Child O' Mine", ["Guns N' Roses"], 'Appetite For Destruction', '5:56'],
      ['Everlong', ['Foo Fighters'], 'The Colour And The Shape', '4:10'],
      ['Last Nite', ['The Strokes'], 'Is This It', '3:13'],
      ['Paranoid Android', ['Radiohead'], 'OK Computer', '6:27']
    ]
  },
  {
    slug: 'yt-electronic-journeys',
    source: 'ytmusic',
    name: 'Electronic Journeys',
    description: 'Long-form progressive and downtempo cuts.',
    owner: 'YouTube Music',
    tracks: [
      ['Strobe', ['deadmau5'], 'For Lack Of A Better Name', '10:37'],
      ['Opus', ['Eric Prydz'], 'Opus', '9:03'],
      ['Innerbloom', ['RÜFÜS DU SOL'], 'Bloom', '9:38'],
      ['Teardrop', ['Massive Attack'], 'Mezzanine', '5:30'],
      ['Porcelain', ['Moby'], 'Play', '4:01'],
      ['Windowlicker', ['Aphex Twin'], 'Windowlicker', '6:07'],
      ['Losing It', ['FISHER'], 'Losing It', '4:07'],
      ['Promises', ['Calvin Harris', 'Sam Smith'], 'Promises', '3:33']
    ]
  }
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseDuration(text: string): number {
  const [minutes, seconds] = text.split(':').map(Number)
  return (minutes * 60 + seconds) * 1000
}

function buildTrack(spec: TrackSpec, source: PlaylistSpec['source']): UnifiedTrack {
  const [title, artists, album, duration] = spec
  const sourceTrackId = `demo-${slugify(`${artists[0]}-${title}`)}`
  const albumId = `demo-album-${slugify(`${artists[0]}-${album}`)}`
  const artworkUrl = gradientArtwork(albumId, album)
  return {
    id: makeTrackId(source, sourceTrackId),
    providerId: 'demo',
    source,
    sourceTrackId,
    title,
    artists: artists.map((name) => ({ id: `demo-artist-${slugify(name)}`, name })),
    album: { id: albumId, name: album, artworkUrl },
    durationMs: parseDuration(duration),
    artworkUrl
  }
}

export interface DemoPlaylist {
  playlist: UnifiedPlaylist
  tracks: UnifiedTrack[]
}

export const DEMO_PLAYLISTS: DemoPlaylist[] = PLAYLISTS.map((spec) => {
  const tracks = spec.tracks.map((t) => buildTrack(t, spec.source))
  return {
    tracks,
    playlist: {
      id: makePlaylistId('demo', spec.slug),
      providerId: 'demo',
      source: spec.source,
      sourcePlaylistId: spec.slug,
      name: spec.name,
      description: spec.description,
      owner: spec.owner,
      artworkUrl: gradientArtwork(spec.slug, spec.name),
      trackCount: tracks.length,
      editable: false,
      isDemo: true
    }
  }
})
