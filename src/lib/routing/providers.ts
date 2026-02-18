export type RoutingProfile = 'driving' | 'walking';

export type RoutingPoint = {
  lat: number;
  lng: number;
};

export type RoutingResult = {
  coordinates: [number, number][];
  distanceKm: number;
};

type RoutingContext = {
  profile: RoutingProfile;
  points: RoutingPoint[];
};

type RoutingProvider = {
  name: 'osrm' | 'mapbox';
  profile: RoutingProfile;
  route: (context: RoutingContext) => Promise<RoutingResult | null>;
};

const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

const parseRoutingResponse = async (response: Response): Promise<{
  code?: string;
  routes?: Array<{
    distance?: number;
    geometry?: {
      coordinates?: [number, number][];
    };
  }>;
} | null> => {
  const body = await response.text();
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        geometry?: {
          coordinates?: [number, number][];
        };
      }>;
    };
  } catch {
    return null;
  }
};

const routeWithOsrmDriving = async (points: RoutingPoint[]): Promise<RoutingResult | null> => {
  if (points.length < 2) {
    return null;
  }

  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coordinates}`);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');

  let response: Response;
  try {
    response = await fetch(url.toString(), { cache: 'no-store' });
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }

  const data = await parseRoutingResponse(response);
  if (!data) {
    return null;
  }

  if (data.code !== 'Ok') {
    return null;
  }

  const route = data.routes?.[0];
  const routeCoordinates = route?.geometry?.coordinates;
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return null;
  }

  const meters = route?.distance;
  return {
    coordinates: routeCoordinates,
    distanceKm: typeof meters === 'number' && Number.isFinite(meters) ? meters / 1000 : 0,
  };
};

const routeWithOsrmWalking = async (points: RoutingPoint[]): Promise<RoutingResult | null> => {
  if (points.length < 2) {
    return null;
  }

  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = new URL(`https://router.project-osrm.org/route/v1/foot/${coordinates}`);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('continue_straight', 'false');

  let response: Response;
  try {
    response = await fetch(url.toString(), { cache: 'no-store' });
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }

  const data = await parseRoutingResponse(response);
  if (!data) {
    return null;
  }

  if (data.code !== 'Ok') {
    return null;
  }

  const route = data.routes?.[0];
  const routeCoordinates = route?.geometry?.coordinates;
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return null;
  }

  const distanceMeters = route?.distance;
  return {
    coordinates: routeCoordinates,
    distanceKm: typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
      ? distanceMeters / 1000
      : 0,
  };
};

const routeWithMapbox = async (profile: RoutingProfile, points: RoutingPoint[]): Promise<RoutingResult | null> => {
  if (!mapboxToken || points.length < 2) {
    return null;
  }

  const profileName = profile === 'walking' ? 'walking' : 'driving';
  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profileName}/${coordinates}`);
  url.searchParams.set('alternatives', 'false');
  url.searchParams.set('continue_straight', 'true');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'false');
  url.searchParams.set('access_token', mapboxToken);

  let response: Response;
  try {
    response = await fetch(url.toString(), { cache: 'no-store' });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const data = await parseRoutingResponse(response);
  if (!data || data.code !== 'Ok') {
    return null;
  }

  const route = data.routes?.[0];
  const routeCoordinates = route?.geometry?.coordinates;
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return null;
  }

  const distanceMeters = route?.distance;
  return {
    coordinates: routeCoordinates,
    distanceKm: typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
      ? distanceMeters / 1000
      : 0,
  };
};

const providers: RoutingProvider[] = [
  {
    name: 'mapbox',
    profile: 'walking',
    route: ({ points }) => routeWithMapbox('walking', points),
  },
  {
    name: 'osrm',
    profile: 'driving',
    route: ({ points }) => routeWithOsrmDriving(points),
  },
  {
    name: 'mapbox',
    profile: 'driving',
    route: ({ points }) => routeWithMapbox('driving', points),
  },
  {
    name: 'osrm',
    profile: 'walking',
    route: ({ points }) => routeWithOsrmWalking(points),
  },
];

export const routeWithProvider = async (profile: RoutingProfile, points: RoutingPoint[]) => {
  const profileOrder: RoutingProfile[] = [profile];

  for (const targetProfile of profileOrder) {
    const profileProviders = providers.filter((candidate) => candidate.profile === targetProfile);
    for (const provider of profileProviders) {
      const routed = await provider.route({ profile: targetProfile, points });
      if (routed) {
        return routed;
      }
    }
  }

  return null;
};
