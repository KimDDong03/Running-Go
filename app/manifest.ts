import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '러닝고',
    short_name: '러닝고',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0ea5e9',
    icons: [],
  };
}
