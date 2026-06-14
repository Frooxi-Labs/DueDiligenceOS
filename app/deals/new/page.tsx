'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DealInput } from '@/lib/deals';

const SAMPLE: DealInput = {
  title: 'Riverside Medical Plaza',
  acquisition_type: 'mixed_use',
  intended_use: 'Mixed-use medical office + ground-floor retail',
  purchase_price: 28500000,
  financing_ltv: 65,
  financing_rate: 6.5,
  hold_period_years: 7,
  documents: `TITLE DEED — Riverside Medical Plaza, Lot 7 Block 2, Travis County, TX.
Estate conveyed: fee simple absolute. Title record shows NO recorded easements.
Ownership: conveyed 2019 from Riverside Holdings LLC to current seller.

ZONING CERTIFICATE — Parcel zoned R-3 (residential, low-density). Current/intended
use is mixed-use medical + retail. (Note: medical/retail use is NOT permitted under R-3.)

PROPERTY INSPECTION — Built 2009, roof replaced 2021. 9 occupied units. Good condition.
SELLER DISCLOSURE — No known environmental issues. Not in a FEMA flood zone.

PURCHASE CONTRACT — Standard commercial APA. Section 4 references a recorded ACCESS
EASEMENT in favor of the adjoining parcel (neighbor ingress/egress across the south drive).
No survey attached.`,
};

const SELECT_OPTIONS = ['residential', 'commercial', 'mixed_use', 'development'] as const;

export default function NewDealPage() {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }));
  const loadSample = () => setV(Object.fromEntries(Object.entries(SAMPLE).map(([k, val]) => [k, String(val)])));

  const [uploaded, setUploaded] = useState<string[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const parts: string[] = [];
    const names: string[] = [];
    for (const file of Array.from(files)) {
      const text = await file.text(); // text-based docs (.txt, .md, .csv); paste PDFs as text
      parts.push(`===== ${file.name} =====\n${text}`);
      names.push(file.name);
    }
    setV((p) => ({ ...p, documents: [p.documents, ...parts].filter(Boolean).join('\n\n') }));
    setUploaded((prev) => [...prev, ...names]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload = {
      title: v.title,
      acquisition_type: v.acquisition_type || 'mixed_use',
      intended_use: v.intended_use,
      purchase_price: v.purchase_price ? Number(v.purchase_price) : undefined,
      financing_ltv: v.financing_ltv ? Number(v.financing_ltv) : undefined,
      financing_rate: v.financing_rate ? Number(v.financing_rate) : undefined,
      hold_period_years: v.hold_period_years ? Number(v.hold_period_years) : undefined,
      documents: v.documents,
    };
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Failed (${res.status})`);
      const { id } = await res.json();
      router.push(`/deals/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const Field = ({ k, label, type = 'text' }: { k: string; label: string; type?: string }) => (
    <div>
      <label className="block text-sm text-neutral-400 mb-1">{label}</label>
      <input
        type={type}
        step="any"
        value={v[k] ?? ''}
        onChange={(e) => set(k, e.target.value)}
        className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm focus:border-neutral-600 outline-none"
      />
    </div>
  );

  return (
    <div className="h-full overflow-auto df-scroll p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">New due-diligence run</h1>
          <button type="button" onClick={loadSample} className="text-sm text-neutral-400 hover:text-white border border-neutral-700 rounded-md px-3 py-1.5">
            Load sample
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field k="title" label="Deal title" />
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Acquisition type</label>
            <select
              value={v.acquisition_type ?? 'mixed_use'}
              onChange={(e) => set('acquisition_type', e.target.value)}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm outline-none"
            >
              {SELECT_OPTIONS.map((o) => (
                <option key={o} value={o}>{o.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <Field k="intended_use" label="Intended use" />
          <div className="grid grid-cols-2 gap-4">
            <Field k="purchase_price" label="Purchase price ($)" type="number" />
            <Field k="hold_period_years" label="Hold period (years)" type="number" />
            <Field k="financing_ltv" label="Financing LTV (%)" type="number" />
            <Field k="financing_rate" label="Interest rate (%)" type="number" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm text-neutral-400">
                Deal documents <span className="text-neutral-600">(title deed, contract, inspection, disclosures…)</span>
              </label>
              <label className="text-xs text-neutral-400 hover:text-white border border-neutral-700 rounded-md px-3 py-1.5 cursor-pointer">
                Upload files
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.json,text/*"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </label>
            </div>
            {uploaded.length > 0 && (
              <p className="text-[11px] text-neutral-500 mb-1">Added: {uploaded.join(', ')}</p>
            )}
            <textarea
              rows={10}
              value={v.documents ?? ''}
              onChange={(e) => set('documents', e.target.value)}
              placeholder="Upload files above, or paste the deal package text here…"
              className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm font-mono focus:border-neutral-600 outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" disabled={submitting} className="w-full rounded-lg bg-white text-black font-medium py-3 hover:bg-neutral-200 transition disabled:opacity-50">
            {submitting ? 'Convening the committee…' : 'Run due diligence →'}
          </button>
        </form>
      </div>
    </div>
  );
}
