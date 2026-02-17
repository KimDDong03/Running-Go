type AnalyticsParams = Record<string, string | number | boolean>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export const trackEvent = (eventName: string, params?: AnalyticsParams) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof window.gtag !== 'function') {
    return;
  }

  const locale = document.documentElement.lang?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  const width = window.innerWidth;
  const deviceType = width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';

  window.gtag('event', eventName, {
    locale,
    device_type: deviceType,
    ...(params ?? {}),
  });
};
