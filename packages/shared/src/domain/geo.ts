/**
 * Geofence helpers (FR-WS-02.4). Pure functions shared by the API (attendance check-in, M5)
 * and clients (showing "outside the zone" before submitting).
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** The geofence part of a branch. A branch without coordinates has no geofence. */
export interface Geofence {
  latitude: number | null;
  longitude: number | null;
  /** Radius in metres. */
  geofenceRadius: number;
}

/** Mean Earth radius in metres (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two points (haversine formula). */
export const haversineMetres = (a: GeoPoint, b: GeoPoint): number => {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** True when the branch has a complete geofence (both coordinates and a positive radius). */
export const hasGeofence = (branch: Geofence): branch is Geofence & GeoPoint =>
  branch.latitude !== null && branch.longitude !== null && branch.geofenceRadius > 0;

/**
 * Is `point` inside the branch geofence (boundary inclusive)? A branch without coordinates has no
 * zone, so the answer is `false`; callers decide whether such a branch allows check-in at all.
 */
export const isWithinGeofence = (point: GeoPoint, branch: Geofence): boolean => {
  if (!hasGeofence(branch)) return false;
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return false;
  return haversineMetres(point, branch) <= branch.geofenceRadius;
};
