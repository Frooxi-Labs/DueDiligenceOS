'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface DealItem {
  id: string;
  title: string;
  status: string;
}

function statusDot(status: string): string {
  if (status === 'decided') return '#22c55e';
  if (status === 'awaiting_human') return '#f59e0b';
  if (status === 'failed') return '#ef4444';
  if (status === 'pending') return '#555';
  return '#3b82f6'; // running phases
}

function statusPulse(status: string): boolean {
  return !['decided', 'failed', 'pending'].includes(status);
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/deals')
      .then((r) => r.json())
      .then((data) => setDeals(Array.isArray(data) ? data : data.deals ?? []))
      .catch(() => {});
  }, [pathname]);

  async function handleDelete(e: React.MouseEvent, dealId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this deal? This cannot be undone.')) return;
    setDeletingId(dealId);
    try {
      await fetch(`/api/deals/${dealId}`, { method: 'DELETE' });
      setDeals((prev) => prev.filter((d) => d.id !== dealId));
      if (pathname === `/deals/${dealId}`) router.push('/');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <aside
      className="flex-shrink-0 flex flex-col h-full py-[10px] transition-all duration-300"
      style={{ width: collapsed ? 52 : 240, paddingLeft: collapsed ? 6 : 10, paddingRight: collapsed ? 6 : 0, background: '#040404' }}
    >
      <div className="flex items-center h-10 mb-3 px-2" style={{ gap: collapsed ? 0 : 8 }}>
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 mx-auto">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 13V6l6-4 6 4v7H10V9H6v4H2z" fill="white" />
          </svg>
        </div>
        {!collapsed && (
          <>
            <span className="text-[14px] font-semibold flex-1 truncate" style={{ color: '#e8e8e6', letterSpacing: '-0.01em' }}>
              DueDiligenceOS
            </span>
            <button onClick={() => setCollapsed(true)} title="Collapse" className="flex-shrink-0 rounded p-1" style={{ color: '#444', background: 'none', border: 'none', cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L5 7l4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </>
        )}
      </div>

      {collapsed && (
        <button onClick={() => setCollapsed(false)} title="Expand" className="mx-auto mb-3 rounded-lg p-2" style={{ color: '#555', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2l4 5-4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}

      <div className={collapsed ? 'px-1 mb-3' : 'px-2 mb-4'}>
        <Link href="/deals/new" title="New run" className="df-sidebar-btn flex items-center rounded-lg" style={{ gap: collapsed ? 0 : 8, padding: collapsed ? '8px' : '8px 12px', color: '#e8e8e6', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d="M7 1v12M1 7h12" stroke="#9b9a97" strokeWidth="1.5" strokeLinecap="round" /></svg>
          {!collapsed && <span className="text-[13px] font-medium">New run</span>}
        </Link>
      </div>

      {!collapsed && (
        <nav className="px-2 mb-4">
          <Link href="/" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px]" style={{ color: pathname === '/' ? '#e8e8e6' : '#9b9a97' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
              <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.7" />
              <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.7" />
              <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.7" />
              <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.7" />
            </svg>
            Dashboard
          </Link>
        </nav>
      )}

      <div className={`flex-1 overflow-y-auto df-scroll ${collapsed ? 'px-1' : 'px-2'}`}>
        {!collapsed && deals.length > 0 && (
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#555' }}>Recent deals</p>
        )}
        <div className="space-y-0.5">
          {deals.map((deal) => {
            const dot = statusDot(deal.status);
            const pulse = statusPulse(deal.status);
            const isActive = pathname === `/deals/${deal.id}`;
            const isDeleting = deletingId === deal.id;
            return (
              <div key={deal.id} className="relative group" onMouseEnter={() => setHoveredId(deal.id)} onMouseLeave={() => setHoveredId(null)}>
                <Link
                  href={`/deals/${deal.id}`}
                  title={collapsed ? deal.title : undefined}
                  className="flex items-center rounded-lg transition-colors"
                  style={{ gap: collapsed ? 0 : 8, padding: collapsed ? '8px' : '8px 12px', justifyContent: collapsed ? 'center' : 'flex-start', background: isActive ? '#1c1c1c' : 'transparent', color: isActive ? '#e8e8e6' : '#9b9a97', opacity: isDeleting ? 0.4 : 1 }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot, animation: pulse ? 'agent-pulse 1.5s ease-in-out infinite' : 'none' }} />
                  {!collapsed && <span className="text-[12px] truncate flex-1 pr-5">{deal.title}</span>}
                </Link>
                {!collapsed && hoveredId === deal.id && !isDeleting && (
                  <button onClick={(e) => handleDelete(e, deal.id)} title="Delete" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1" style={{ color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2L2 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pt-3 mt-2 border-t" style={{ borderColor: '#1a1a1a' }}>
          <p className="text-[10px] font-medium" style={{ color: '#555' }}>Band of Agents Hackathon</p>
          <p className="text-[10px] mt-0.5" style={{ color: '#3a3a3a' }}>June 2026 · Frooxi</p>
        </div>
      )}
    </aside>
  );
}
