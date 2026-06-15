import { describe, it, expect } from 'vitest';
import { computeUnderwriting } from '@/lib/finance/underwrite';

describe('computeUnderwriting', () => {
  const base = { purchasePrice: 10_000_000, ltvPct: 60, ratePct: 6, holdYears: 5, noi: 600_000, exitCapPct: 6 };

  it('computes DSCR as NOI / interest-only debt service', () => {
    // loan 6M @ 6% = 360k debt service; 600k / 360k ≈ 1.67
    expect(computeUnderwriting(base).dscr).toBeCloseTo(1.67, 1);
  });

  it('produces a finite, positive levered IRR for a healthy deal', () => {
    const u = computeUnderwriting(base);
    expect(Number.isFinite(u.irrPct)).toBe(true);
    expect(u.irrPct).toBeGreaterThan(0);
  });

  it('is deterministic — same inputs, same numbers', () => {
    expect(computeUnderwriting(base)).toEqual(computeUnderwriting(base));
  });

  it('lower NOI yields a lower IRR (the cascade direction)', () => {
    const strong = computeUnderwriting(base).irrPct;
    const haircut = computeUnderwriting({ ...base, noi: 450_000 }).irrPct;
    expect(haircut).toBeLessThan(strong);
  });

  it('handles zero debt service without dividing by zero', () => {
    expect(computeUnderwriting({ ...base, ltvPct: 0 }).dscr).toBe(0);
  });
});
