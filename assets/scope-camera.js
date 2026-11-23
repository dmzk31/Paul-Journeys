// Pure 2D Mercator camera constraints for the two reference maps.
// MapLibre GL JS 5.6.2 transformCameraUpdate receives a proposed camera state
// and requires a LngLat instance in its return value. This helper deliberately
// returns a plain coordinate pair; the caller wraps it with new LngLat(...).
// https://github.com/maplibre/maplibre-gl-js/blob/v5.6.2/src/ui/camera.ts

const TILE_SIZE = 512;
const MAX_MERCATOR_LATITUDE = 85.0511287798066;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const radians = (degrees) => degrees * Math.PI / 180;
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function mercatorX(longitude) { return (longitude + 180) / 360; }
function mercatorY(latitude) {
  const phi = radians(clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE));
  return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2;
}
function latitudeFromY(y) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI; }
function longitudeFromX(x) { return x * 360 - 180; }

function dimensions(width, height) {
  return { width: Math.max(1, finite(width, 1)), height: Math.max(1, finite(height, 1)) };
}
function projectedScope(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 2 || !bounds.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) {
    throw new TypeError('Scope bounds must be [[west,south],[east,north]].');
  }
  const [[west, south], [east, north]] = bounds;
  if (!(west < east && south < north) || west < -180 || east > 180 || south < -MAX_MERCATOR_LATITUDE || north > MAX_MERCATOR_LATITUDE) {
    throw new RangeError('Scope must be a valid non-wrapping Mercator rectangle.');
  }
  const left = mercatorX(west), right = mercatorX(east);
  const top = mercatorY(north), bottom = mercatorY(south);
  return { left, right, top, bottom, spanX: right - left, spanY: bottom - top, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}
function bearingAngle(bearing) {
  const normalized = ((finite(bearing, 0) + 180) % 360 + 360) % 360 - 180;
  const angle = radians(normalized);
  return { bearing: normalized, cosine: Math.abs(Math.cos(angle)), sine: Math.abs(Math.sin(angle)) };
}
function fitZoomFor(scope, viewport, angle, padding) {
  const inset = Math.max(0, finite(padding, 12));
  const availableWidth = Math.max(1, viewport.width - 2 * Math.min(inset, viewport.width / 4));
  const availableHeight = Math.max(1, viewport.height - 2 * Math.min(inset, viewport.height / 4));
  const rotatedWidth = scope.spanX * angle.cosine + scope.spanY * angle.sine;
  const rotatedHeight = scope.spanX * angle.sine + scope.spanY * angle.cosine;
  return Math.log2(Math.min(availableWidth / (TILE_SIZE * rotatedWidth), availableHeight / (TILE_SIZE * rotatedHeight)));
}

/**
 * Minimum allowed zoom: FIT the entire scope, with neutral letterboxing when
 * the viewport's aspect differs. Unlike maxBounds, this never zooms to COVER.
 * Recalculate after viewport resize or a change of 2D bearing.
 */
export function scopeFitZoom(bounds, width, height, bearing = 0, padding = 12) {
  return fitZoomFor(projectedScope(bounds), dimensions(width, height), bearingAngle(bearing), padding);
}

function constrainAxis(value, low, high, halfFootprint) {
  // If this viewport dimension exceeds the content, hold the content at its
  // middle and permit only neutral gutters. At closer zooms, keep the rotated
  // viewport's footprint inside the geographic scope.
  if (2 * halfFootprint >= high - low) return (low + high) / 2;
  return clamp(value, low + halfFootprint, high - halfFootprint);
}

/**
 * @param {object} next Proposed MapLibre camera state (center pair or LngLat).
 * @param {number[][]} bounds [[west,south],[east,north]] without world wrapping.
 * @param {number} width Current map container clientWidth.
 * @param {number} height Current map container clientHeight.
 * @param {{padding?:number,maxZoom?:number}} options Optional 12px fit padding
 * and 10 maximum zoom. Geographic content outside scope must be masked by
 * the caller; gutters are intentionally permitted instead of a world view.
 * @returns {{center:number[],zoom:number,bearing:number,pitch:number,roll:number}}
 */
export function constrainScopeCamera(next, bounds, width, height, options = {}) {
  const scope = projectedScope(bounds);
  const viewport = dimensions(width, height);
  const angle = bearingAngle(next?.bearing);
  const minimum = fitZoomFor(scope, viewport, angle, options.padding ?? 12);
  const maximum = Math.max(minimum, finite(options.maxZoom, 10));
  const zoom = clamp(finite(next?.zoom, minimum), minimum, maximum);
  const worldSize = TILE_SIZE * 2 ** zoom;
  const center = next?.center;
  const longitude = finite(Array.isArray(center) ? center[0] : center?.lng, longitudeFromX(scope.centerX));
  const latitude = finite(Array.isArray(center) ? center[1] : center?.lat, latitudeFromY(scope.centerY));
  const halfX = (viewport.width * angle.cosine + viewport.height * angle.sine) / (2 * worldSize);
  const halfY = (viewport.width * angle.sine + viewport.height * angle.cosine) / (2 * worldSize);
  const x = constrainAxis(mercatorX(longitude), scope.left, scope.right, halfX);
  const y = constrainAxis(mercatorY(latitude), scope.top, scope.bottom, halfY);
  return { center: [longitudeFromX(x), latitudeFromY(y)], zoom, bearing: angle.bearing, pitch: 0, roll: 0 };
}
