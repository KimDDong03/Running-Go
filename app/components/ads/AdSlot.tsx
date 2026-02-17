'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdSlotProps = {
  className?: string;
  slotId?: string;
  format?: 'auto' | 'rectangle' | 'horizontal';
};

const hasGrantedConsent = () => {
  if (typeof document === 'undefined') {
    return false;
  }

  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('rg-consent='));
  return cookie?.split('=')[1] === 'granted';
};

const mapFormatToStyle = (format: AdSlotProps['format']) => {
  if (format === 'horizontal') {
    return { display: 'block', width: '100%', minHeight: '90px' };
  }
  if (format === 'rectangle') {
    return { display: 'block', width: '100%', minHeight: '250px' };
  }
  return { display: 'block' };
};

export function AdSlot({ className, slotId, format = 'auto' }: AdSlotProps) {
  const initializedRef = useRef(false);
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  const effectiveSlot = slotId ?? process.env.NEXT_PUBLIC_ADSENSE_SLOT_INLINE;
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    setHasConsent(hasGrantedConsent());
  }, []);

  useEffect(() => {
    if (!clientId || !effectiveSlot) {
      return;
    }
    if (!hasConsent) {
      return;
    }
    if (initializedRef.current) {
      return;
    }

    try {
      const queue = window.adsbygoogle ?? [];
      window.adsbygoogle = queue;
      queue.push({});
      initializedRef.current = true;
    } catch {
      initializedRef.current = false;
    }
  }, [clientId, effectiveSlot, hasConsent]);

  if (!clientId || !effectiveSlot || !hasConsent) {
    return null;
  }

  return (
    <div className={className}>
      <ins
        className="adsbygoogle"
        style={mapFormatToStyle(format)}
        data-ad-client={clientId}
        data-ad-slot={effectiveSlot}
        data-ad-format={format === 'auto' ? 'auto' : undefined}
        data-full-width-responsive={format === 'auto' ? 'true' : undefined}
      />
    </div>
  );
}
