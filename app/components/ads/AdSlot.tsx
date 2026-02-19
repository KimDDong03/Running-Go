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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  const effectiveSlot = slotId ?? process.env.NEXT_PUBLIC_ADSENSE_SLOT_INLINE;
  const [hasConsent, setHasConsent] = useState(() => hasGrantedConsent());

  useEffect(() => {
    const syncConsent = () => {
      setHasConsent(hasGrantedConsent());
    };

    window.addEventListener('rg-consent-changed', syncConsent);
    return () => {
      window.removeEventListener('rg-consent-changed', syncConsent);
    };
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const suspiciousPattern = /<\/?body|background-color:\s*transparent|marginwidth|marginheight/i;

    const sanitizeTextNodes = () => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const targets: Text[] = [];

      let current = walker.nextNode();
      while (current) {
        const node = current as Text;
        if (suspiciousPattern.test(node.textContent ?? '')) {
          targets.push(node);
        }
        current = walker.nextNode();
      }

      targets.forEach((node) => {
        node.textContent = '';
      });
    };

    sanitizeTextNodes();

    const observer = new MutationObserver(() => {
      sanitizeTextNodes();
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  if (!clientId || !effectiveSlot || !hasConsent) {
    return null;
  }

  return (
    <div ref={containerRef} className={className}>
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
