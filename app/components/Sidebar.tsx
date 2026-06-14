'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tree, Folder, File } from '@/components/ui/file-tree';
import ChatRoomIcon from './ChatRoomIcon';
import type { ForkProjection, SimBranch } from '@/types';

interface DealItem {
  id: string;
  title: string;
  status: string;
}

const BRANCH_ORDER: SimBranch[] = ['proceed', 'remediate', 'renegotiate'];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [branches, setBranches] = useState<ForkProjection[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const seg = pathname.startsWith('/deals/') ? pathname.split('/')[2] : null;
  const activeDealId = seg && seg !== 'new' ? seg : null;
  const roomParam = searchParams.get('room');

  useEffect(() => {
    fetch('/api/deals')
      .then((r) => r.json())
      .then((data) => setDeals(Array.isArray(data) ? data : data.deals ?? []))
      .catch(() => {});
  }, [pathname]);

  // Load the simulated branch rooms for the active deal (nested under it in the tree).
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the tree when the active deal changes
    if (!activeDealId) { setBranches([]); setPending(new Set()); return; }
    fetch(`/api/deals/${activeDealId}/projections`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setBranches(Array.isArray(d.projections) ? d.projections : []); setPending(new Set()); } })
      .catch(() => { if (!cancelled) setBranches([]); });
    return () => { cancelled = true; };
  }, [activeDealId]);

  // Live: child rooms appear the moment they're created, no refresh needed.
  useEffect(() => {
    if (!activeDealId) return;
    const es = new EventSource(`/api/deals/${activeDealId}/stream`);
    es.onmessage = (event) => {
      if (!event.data || event.data.startsWith(':')) return;
      try {
        const ev = JSON.parse(event.data);
        if (ev.type === 'fork.thinking') setPending((prev) => new Set(prev).add(ev.branch));
        else if (ev.type === 'fork.simulated' && Array.isArray(ev.projections)) { setBranches(ev.projections); setPending(new Set()); }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [activeDealId]);

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

        {/* Collapsed: simple chat-icon links. */}
        {collapsed ? (
          <div className="space-y-0.5">
            {deals.map((deal) => {
              const isActive = pathname === `/deals/${deal.id}`;
              return (
                <Link key={deal.id} href={`/deals/${deal.id}`} title={deal.title} className="flex items-center justify-center rounded-lg p-2" style={{ background: isActive ? '#1c1c1c' : 'transparent', color: isActive ? '#e8e8e6' : '#7a7a78' }}>
                  <ChatRoomIcon className="w-4 h-4" />
                </Link>
              );
            })}
          </div>
        ) : (
          /* Expanded: a file tree — each deal is a room, simulated branches nest under it. */
          <Tree
            key={`${activeDealId ?? 'none'}|${roomParam ?? ''}`}
            initialExpandedItems={activeDealId ? [activeDealId] : []}
            initialSelectedId={activeDealId ? (roomParam ? `${activeDealId}:${roomParam}` : activeDealId) : undefined}
            indicator
          >
            {deals.map((deal) => {
              const isActiveDeal = deal.id === activeDealId;
              const dealBranches = isActiveDeal ? branches : [];
              return (
                <div key={deal.id} className="relative group" onMouseEnter={() => setHoveredId(deal.id)} onMouseLeave={() => setHoveredId(null)}>
                  <Folder
                    value={deal.id}
                    element={deal.title}
                    onSelect={() => router.push(`/deals/${deal.id}`)}
                    icon={<ChatRoomIcon className="w-4 h-4 shrink-0 text-white" />}
                    style={{ opacity: deletingId === deal.id ? 0.4 : 1 }}
                  >
                    {(() => {
                      const shown = BRANCH_ORDER.filter((br) => dealBranches.some((p) => p.branch === br) || (isActiveDeal && pending.has(br)));
                      if (shown.length === 0) return <span className="block px-1.5 py-1 text-[11px] text-neutral-600">{isActiveDeal ? 'No simulated branches yet' : 'Open to view rooms'}</span>;
                      return shown.map((br) => {
                        const pr = dealBranches.find((x) => x.branch === br);
                        return (
                          <File
                            key={br}
                            value={`${deal.id}:${br}`}
                            onSelect={() => router.push(`/deals/${deal.id}?room=${br}`)}
                            fileIcon={<span className="w-1.5 shrink-0" />}
                          >
                            <span className="capitalize truncate">{br}</span>
                            <span className="ml-auto text-[10px] text-neutral-600 tabular-nums">{pr ? `${pr.projected_irr_pct.toFixed(1)}%` : '…'}</span>
                          </File>
                        );
                      });
                    })()}
                  </Folder>
                  {hoveredId === deal.id && deletingId !== deal.id && (
                    <button onClick={(e) => handleDelete(e, deal.id)} title="Delete" className="absolute right-1.5 top-1.5 z-10 rounded p-1" style={{ color: '#555', background: '#040404', border: 'none', cursor: 'pointer' }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2L2 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
              );
            })}
          </Tree>
        )}
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
