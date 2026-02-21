import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXTAUTH_URL ?? 'https://running-go-ten.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    '',
    '/about',
    '/faq',
    '/contact',
    '/terms',
    '/privacy',
    '/cookies',
    '/courses',
    '/collection',
    '/missions',
    '/rankings',
    '/profile',
    '/create',
    '/login',
  ].map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));
}
