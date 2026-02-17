'use client';

import { useEffect } from 'react';

const CONSENT_COOKIE_KEY = 'rg-consent';
const ADSENSE_SCRIPT_ID = 'adsense-script';

const hasGrantedConsent = () => {
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE_KEY}=`));
  if (!cookie) return false;
  return cookie.split('=')[1] === 'granted';
};

const ensureAdSenseScript = (clientId: string) => {
  if (document.getElementById(ADSENSE_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement('script');
  script.id = ADSENSE_SCRIPT_ID;
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
};

export function AdSenseBootstrap() {
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
    if (!clientId) {
      return;
    }

    const sync = () => {
      if (hasGrantedConsent()) {
        ensureAdSenseScript(clientId);
      }
    };

    sync();
    window.addEventListener('rg-consent-changed', sync);
    return () => {
      window.removeEventListener('rg-consent-changed', sync);
    };
  }, []);

  return null;
}
