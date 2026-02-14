interface PreviewPoint {
  lat: number;
  lng: number;
}

interface PreviewOptions {
  width: number;
  height: number;
}

const DEFAULT_CENTER: PreviewPoint = { lat: 37.5665, lng: 126.978 };

const escapeSvg = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizePath = (points: PreviewPoint[], width: number, height: number) => {
  if (points.length < 2) {
    return '';
  }

  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLng = Math.min(...points.map((point) => point.lng));
  const maxLng = Math.max(...points.map((point) => point.lng));

  const lngRange = Math.max(maxLng - minLng, 0.0001);
  const latRange = Math.max(maxLat - minLat, 0.0001);
  const padding = 16;
  const renderWidth = Math.max(width - padding * 2, 1);
  const renderHeight = Math.max(height - padding * 2, 1);

  return points
    .map((point, index) => {
      const x = padding + ((point.lng - minLng) / lngRange) * renderWidth;
      const y = padding + (1 - ((point.lat - minLat) / latRange)) * renderHeight;
      const command = index === 0 ? 'M' : 'L';
      return `${command}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

export const getCoursePreviewImageUrl = (
  waypoints: PreviewPoint[] | undefined,
  center: PreviewPoint | undefined,
  options: PreviewOptions
) => {
  const { width, height } = options;
  const points = Array.isArray(waypoints) ? waypoints : [];
  const pathData = normalizePath(points, width, height);
  const pin = center ?? (points[0] ?? DEFAULT_CENTER);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e0f2fe" />
      <stop offset="55%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#dcfce7" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <circle cx="${(width * 0.82).toFixed(2)}" cy="${(height * 0.2).toFixed(2)}" r="${(Math.min(width, height) * 0.15).toFixed(2)}" fill="rgba(14,165,233,0.12)" />
  <circle cx="${(width * 0.14).toFixed(2)}" cy="${(height * 0.78).toFixed(2)}" r="${(Math.min(width, height) * 0.18).toFixed(2)}" fill="rgba(16,185,129,0.10)" />
  ${pathData ? `<path d="${escapeSvg(pathData)}" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.88" />` : ''}
  ${pathData ? `<path d="${escapeSvg(pathData)}" fill="none" stroke="#0ea5e9" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.96" />` : ''}
  ${!pathData ? `<circle cx="${(width / 2).toFixed(2)}" cy="${(height / 2).toFixed(2)}" r="10" fill="#0ea5e9" opacity="0.78" />` : ''}
  <text x="12" y="${height - 12}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11" fill="#64748b">${escapeSvg(`${pin.lat.toFixed(3)}, ${pin.lng.toFixed(3)}`)}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
};
