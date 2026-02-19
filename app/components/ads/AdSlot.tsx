'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

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

const AD_BLOCKED_PATHS = ['/run/result'];
const AD_BLOCKED_PREFIXES = ['/login', '/run', '/create'];

const isPathEligibleForAds = (pathname: string) => {
  if (!pathname) return false;
  if (AD_BLOCKED_PATHS.includes(pathname)) return false;
  return !AD_BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix) && pathname !== '/');
};

export function AdSlot({ className, slotId, format = 'auto' }: AdSlotProps) {
  const initializedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const isPathEligible = Boolean(pathname && isPathEligibleForAds(pathname));
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  const effectiveSlot = slotId ?? process.env.NEXT_PUBLIC_ADSENSE_SLOT_INLINE;
  const [hasConsent, setHasConsent] = useState(() => hasGrantedConsent());
  const [hasEnoughPublisherContent, setHasEnoughPublisherContent] = useState(false);

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
    if (!isPathEligible) {
      return;
    }

    if (typeof document === 'undefined') {
      return;
    }

    let rafId: number | null = null;
    const root = document.querySelector('main') ?? document.body;
    if (!root) {
      return;
    }

    const evaluateContent = () => {
      const text = (root.textContent ?? '').replace(/\s+/g, ' ').trim();
      const textLength = text.length;
      const informativeNodeCount = root.querySelectorAll('p, li, h2, h3').length;
      const actionableOnlyNodeCount = root.querySelectorAll('button, [role="button"]').length;
      const hasEnoughText = textLength >= 280;
      const hasEnoughStructure = informativeNodeCount >= 4;
      const actionBiasSafe = actionableOnlyNodeCount <= informativeNodeCount * 3;
      setHasEnoughPublisherContent(hasEnoughText && hasEnoughStructure && actionBiasSafe);
    };

    const scheduleEvaluate = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        evaluateContent();
      });
    };

    scheduleEvaluate();
    const observer = new MutationObserver(scheduleEvaluate);
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    };
  }, [isPathEligible]);

  useEffect(() => {
    if (!clientId || !effectiveSlot) {
      return;
    }
    if (!hasConsent) {
      return;
    }
    if (!isPathEligible || !hasEnoughPublisherContent) {
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
  }, [clientId, effectiveSlot, hasConsent, hasEnoughPublisherContent, isPathEligible]);

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

  if (!clientId || !effectiveSlot || !hasConsent || !isPathEligible || !hasEnoughPublisherContent) {
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
