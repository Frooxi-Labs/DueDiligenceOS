'use client';
import { usePathname } from 'next/navigation';

/** Re-mounts children on route change to replay the page-in animation. */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-in h-full">
      {children}
    </div>
  );
}
