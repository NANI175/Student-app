// ─────────────────────────────────────────────────────────────
// PathPulse Student – Shared Types (aligned with spec)
// ─────────────────────────────────────────────────────────────

export type StopType = 'origin' | 'stop' | 'destination';

export interface Stop {
  order: number;
  name: string;
  lat: number;
  lng: number;
  type: StopType;
}

export type BusStatus = 'Active' | 'Idle' | 'Delayed' | 'Offline';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface BusDoc {
  id: string;
  busNumber: string;
  assignedRouteId: string | null;
  driverId: string | null;
  status: BusStatus;
  lastLocation: GeoPoint | null;
  lastUpdated: unknown | null;
}

export interface RouteDoc {
  id: string;
  routeNumber: string;
  routeName: string;
  routeColor: string;
  stops: Stop[];
  isActive: boolean;
}

export interface BusPosition {
  top: number;
  index: number;
  ratio: number;
}

export interface TrackingStatus {
  nearStop: Stop | null;
  busPosition: BusPosition;
  speed: number | null;
  etaMinutes: number | null;
}