export interface YoutubeRef {
  videoId: string;
  title: string;
  channel: string;
  duration?: string;
  views?: string;
  url: string;
  embedUrl: string;
}

export interface CatalogSong {
  slug: string;
  title: string;
  hasTab: boolean;
  hasChords: boolean;
  hasVideos?: boolean;
  songId?: number;
  revisionId?: number;
  source?: string;
  sourceUrl?: string;
  trackCount?: number;
  fetchedAt?: string;
  chordsSourceUrl?: string;
  youtubeRefs?: YoutubeRef[];
  originalArtist?: string;
}

export interface ChordSegment {
  chord?: string;
  text?: string;
}

export interface ChordLine {
  kind: 'plain' | 'lyric' | 'tuning';
  segments: ChordSegment[];
}

export interface ChordsFile {
  meta: {
    songId: number;
    chordsRevisionId: number;
    chordpro: string;
    artist: string;
    title: string;
    tuning?: string;
  };
  lines: ChordLine[];
  uniqueChords: string[];
}

export interface CatalogArtist {
  slug: string;
  name: string;
  songs: CatalogSong[];
}

export interface Catalog {
  generatedAt: string;
  artists: CatalogArtist[];
}
