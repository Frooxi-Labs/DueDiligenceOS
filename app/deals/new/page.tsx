'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DealInput } from '@/lib/deals';

const SAMPLE: DealInput = {
  title: 'Riverside Medical Plaza',
  property_type: 'Mixed-use medical / retail',
  location: 'Austin, TX',
  size_sqft: 84000,
  asking_price: 28500000,
  occupancy_pct: 92,
  cap_rate_stabilized: 6.75,
  financing_ltv: 65,
  financing_rate: 6.5,
  hold_period_years: 7,
  business_context:
    'Stabilized medical office plaza with 9 occupied units. Anchor tenant is a regional health system on a 12-year NNN lease. Two retail units roll in 18 months. Seller is motivated due to a 1031 deadline.',
  additional_notes: 'Built 2009. Roof replaced 2021. No known environmental issues.',
};

const FIELDS: { key: keyof DealInput; label: string; type: 'text' | 'number' | 'area' }[] = [
  { key: 'title', label: 'Deal title', type: 'text' },
  { key: 'property_type', label: 'Property type', type: 'text' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'size_sqft', label: 'Size (sq ft)', type: 'number' },
  { key: 'asking_price', label: 'Asking price ($)', type: 'number' },
  { key: 'occupancy_pct', label: 'Occupancy (%)', type: 'number' },
  { key: 'cap_rate_stabilized', label: 'Stabilized cap rate (%)', type: 'number' },
  { key: 'financing_ltv', label: 'Financing LTV (%)', type: 'number' },
  { key: 'financing_rate', label: 'Interest rate (%)', type: 'number' },
  { key: 'hold_period_years', label: 'Hold period (years)', type: 'number' },
  { key: 'business_context', label: 'Business context', type: 'area' },
  { key: 'additional_notes', label: 'Additional notes (optional)', type: 'area' },
];

export default function NewDealPage() {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const loadSample = () =>
    setValues(Object.fromEntries(Object.entries(SAMPLE).map(([k, v]) => [k, String(v)])));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const raw = values[f.key] ?? '';
      if (f.type === 'number') payload[f.key] = raw === '' ? undefined : Number(raw);
      else if (raw !== '') payload[f.key] = raw;
    }
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const { id } = await res.json();
      router.push(`/deals/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full overflow-auto df-scroll p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">New deal review</h1>
          <button
            type="button"
            onClick={loadSample}
            className="text-sm text-neutral-400 hover:text-white border border-neutral-700 rounded-md px-3 py-1.5"
          >
            Load sample
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-sm text-neutral-400 mb-1">{f.label}</label>
              {f.type === 'area' ? (
                <textarea
                  rows={3}
                  value={values[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm focus:border-neutral-600 outline-none"
                />
              ) : (
                <input
                  type={f.type}
                  step="any"
                  value={values[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm focus:border-neutral-600 outline-none"
                />
              )}
            </div>
          ))}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-white text-black font-medium py-3 hover:bg-neutral-200 transition disabled:opacity-50"
          >
            {submitting ? 'Convening the committee…' : 'Run the committee →'}
          </button>
        </form>
      </div>
    </div>
  );
}
