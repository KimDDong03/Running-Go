import type { AppLocale } from '@/lib/i18n/constants';

export type MapProviderName = 'mapbox' | 'google';

export type MapProviderConfig = {
  defaultProvider: MapProviderName;
  mapboxToken?: string;
  googleMapsApiKey?: string;
};

export const getMapProviderConfig = (): MapProviderConfig => {
  const defaultProvider = (process.env.NEXT_PUBLIC_MAP_PROVIDER as MapProviderName | undefined) ?? 'mapbox';
  return {
    defaultProvider,
    mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  };
};

export const resolveMapProvider = (locale: AppLocale): MapProviderName => {
  const config = getMapProviderConfig();

  if (config.defaultProvider === 'mapbox') {
    return 'mapbox';
  }

  if (config.defaultProvider === 'google') {
    if (config.googleMapsApiKey) {
      return 'google';
    }
    return 'mapbox';
  }

  if (locale !== 'ko') {
    return 'mapbox';
  }

  return 'mapbox';
};
