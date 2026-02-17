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
  name: 'osrm';
  supports: (profile: RoutingProfile) => boolean;
  route: (context: RoutingContext) => Promise<RoutingResult | null>;
};

const routeWithOsrmDriving = async (points: RoutingPoint[]): Promise<RoutingResult | null> => {
  if (points.length < 2) {
    return null;
  }

  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coordinates}`);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');

  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    return null;
  }

  const data = await response.json() as {
    code?: string;
    routes?: Array<{
      distance?: number;
      geometry?: {
        coordinates?: [number, number][];
      };
    }>;
  };

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

  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    return null;
  }

  const data = await response.json() as {
    code?: string;
    routes?: Array<{
      distance?: number;
      geometry?: {
        coordinates?: [number, number][];
      };
    }>;
  };

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

const providers: RoutingProvider[] = [
  {
    name: 'osrm',
    supports: (profile) => profile === 'driving',
    route: ({ points }) => routeWithOsrmDriving(points),
  },
  {
    name: 'osrm',
    supports: (profile) => profile === 'walking',
    route: ({ points }) => routeWithOsrmWalking(points),
  },
];

export const routeWithProvider = async (profile: RoutingProfile, points: RoutingPoint[]) => {
  const provider = providers.find((candidate) => candidate.supports(profile));
  if (!provider) {
    return null;
  }

  return provider.route({ profile, points });
};
