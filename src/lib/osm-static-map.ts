interface OsmStaticMapSize {
  width: number;
  height: number;
}

interface OsmPoint {
  lat: number;
  lng: number;
}

const DEFAULT_ZOOM = 13;
const MAX_STATIC_PATH_POINTS = 60;
const STATIC_MAP_BASE_URL = 'https://staticmap.openstreetmap.fr/staticmap.php';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const toFixedCoordinate = (value: number) => value.toFixed(6);

const samplePath = (points: OsmPoint[]) => {
  if (points.length <= MAX_STATIC_PATH_POINTS) {
    return points;
  }

  const step = Math.ceil(points.length / MAX_STATIC_PATH_POINTS);
  const sampled: OsmPoint[] = [];

  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]);
  }

  const lastPoint = points[points.length - 1];
  if (sampled[sampled.length - 1] !== lastPoint) {
    sampled.push(lastPoint);
  }

  return sampled;
};

const getPathCenter = (points: OsmPoint[]) => {
  const bounds = points.reduce(
    (acc, point) => ({
      minLat: Math.min(acc.minLat, point.lat),
      maxLat: Math.max(acc.maxLat, point.lat),
      minLng: Math.min(acc.minLng, point.lng),
      maxLng: Math.max(acc.maxLng, point.lng),
    }),
    {
      minLat: points[0].lat,
      maxLat: points[0].lat,
      minLng: points[0].lng,
      maxLng: points[0].lng,
    }
  );

  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  };
};

const buildBaseUrl = (center: OsmPoint, size: OsmStaticMapSize, zoom: number) => {
  const url = new URL(STATIC_MAP_BASE_URL);
  url.searchParams.set('center', `${toFixedCoordinate(center.lat)},${toFixedCoordinate(center.lng)}`);
  url.searchParams.set('zoom', String(clamp(Math.round(zoom), 1, 18)));
  url.searchParams.set('size', `${Math.round(size.width)}x${Math.round(size.height)}`);
  url.searchParams.set('maptype', 'mapnik');
  return url;
};

export const getOsmStaticMapImageUrl = (center: OsmPoint, size: OsmStaticMapSize, zoom = DEFAULT_ZOOM) => {
  return buildBaseUrl(center, size, zoom).toString();
};

export const getOsmStaticPathImageUrl = (
  points: OsmPoint[],
  size: OsmStaticMapSize,
  options?: { zoom?: number; lineColorHex?: string; lineWidth?: number }
) => {
  if (points.length < 2) {
    return getOsmStaticMapImageUrl(points[0] ?? { lat: 37.5665, lng: 126.978 }, size, options?.zoom ?? DEFAULT_ZOOM);
  }

  const sampledPoints = samplePath(points);
  const center = getPathCenter(sampledPoints);
  const url = buildBaseUrl(center, size, options?.zoom ?? DEFAULT_ZOOM);
  const lineColorHex = (options?.lineColorHex ?? '0ea5e9ff').replace('#', '').toLowerCase();
  const lineWidth = options?.lineWidth ?? 4;
  const serializedPoints = sampledPoints
    .map((point) => `${toFixedCoordinate(point.lat)},${toFixedCoordinate(point.lng)}`)
    .join('|');

  url.searchParams.set('path', `color:0x${lineColorHex}|weight:${lineWidth}|${serializedPoints}`);

  return url.toString();
};
