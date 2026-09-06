export type FilterId =
  | 'haru-pastel'
  | 'life4cuts-noir'
  | 'disposable-98'
  | 'golden-sunset'
  | 'indie-35mm'
  | 'original';

export interface PhotoboothFilter {
  id: FilterId;
  name: string;
  tagline: string;
  badge: string;
  cssFilter: string;
  overlayClass?: string;
  tintColor?: string;
  description: string;
  vignette?: boolean;
  dateStamp?: boolean;
}

export type StripLayout = '2-cut' | '3-cut' | '4-cut' | 'grid-4' | 'split-duo';

export interface FrameColor {
  id: string;
  name: string;
  bgHex: string;
  textHex: string;
  borderHex: string;
  accentHex: string;
  isFilmStrip?: boolean;
}

export interface CoupleProfile {
  partner1: string;
  partner2: string;
  location1: string;
  location2: string;
  distanceKm?: number;
  dateText?: string;
  loveNote: string;
}

export interface CapturedPhoto {
  id: string;
  dataUrl: string;
  source: 'local' | 'remote' | 'upload';
  timestamp: number;
  filter: FilterId;
}

export interface PhotostripSession {
  id: string;
  timestamp: number;
  layout: StripLayout;
  filter: FilterId;
  frameColor: string;
  photos: CapturedPhoto[];
  couple: CoupleProfile;
  stickers: string[];
}

export type PeerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface PeerSyncMessage {
  type:
    | 'countdown-start'
    | 'countdown-tick'
    | 'snap-trigger'
    | 'photo-data'
    | 'filter-change'
    | 'layout-change'
    | 'ping';
  countdownSec?: number;
  filterId?: FilterId;
  layoutId?: StripLayout;
  photoUrl?: string;
  sourceName?: string;
  timestamp?: number;
}
