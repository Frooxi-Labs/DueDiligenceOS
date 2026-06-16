'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';

/**
 * Branded route-transition overlay. On every navigation it shows the Band mark
 * in a spinning ring for a guaranteed minimum (~0.65s) so the transition reads
 * as deliberate instead of flashing. Portals to body so it covers everything.
 */
export default function RouteLoader() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);
  const first = useRef(true);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (first.current) { first.current = false; return; } // no flash on first load
    setShow(true);
    const t = setTimeout(() => setShow(false), 650);
    return () => clearTimeout(t);
  }, [pathname]);

  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center transition-opacity duration-300"
      style={{ background: '#0b0c0e', opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none' }}
      aria-hidden={!show}
    >
      <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
        <span
          className="absolute inset-0 rounded-full animate-spin"
          style={{ border: '2px solid rgba(255,255,255,0.08)', borderTopColor: '#35d277', animationDuration: '0.85s' }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={28} height={28} className="rounded-md" style={{ opacity: 0.95 }} />
      </div>
    </div>,
    document.body,
  );
}
