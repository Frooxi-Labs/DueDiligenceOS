/**
 * Deterministic real-estate underwriting — DSCR and levered IRR computed from
 * the deal terms and NOI, not guessed by an LLM. The Financial agent estimates
 * the income (NOI, market cap rate); this module turns that into the headline
 * return numbers reproducibly, so the IRR a reviewer sees is auditable. Pure and
 * unit-tested.
 */

export interface UnderwriteInputs {
  purchasePrice: number;
  ltvPct: number; // loan-to-value, %
  ratePct: number; // interest rate, %
  holdYears: number;
  noi: number; // year-1 net operating income
  exitCapPct?: number; // cap rate at sale; defaults to going-in cap
  noiGrowthPct?: number; // annual NOI growth; defaults to 2.5%
}

export interface UnderwriteResult {
  dscr: number; // debt-service coverage ratio (year 1)
  irrPct: number; // levered IRR over the hold, %
  annualDebtService: number;
  equity: number;
  exitCapPct: number;
}

const npv = (rate: number, cashflows: number[]): number =>
  cashflows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);

/** Levered IRR via bisection over a bracketed range — bounded, no loops beyond a fixed cap. */
function irr(cashflows: number[]): number {
  let lo = -0.95;
  let hi = 2.0; // 200% upper bracket
  let fLo = npv(lo, cashflows);
  let fHi = npv(hi, cashflows);
  if (fLo * fHi > 0) return NaN; // no sign change in range → undefined
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, cashflows);
    if (Math.abs(fMid) < 1) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export function computeUnderwriting(i: UnderwriteInputs): UnderwriteResult {
  const price = Math.max(0, i.purchasePrice);
  const loan = (price * Math.min(Math.max(i.ltvPct, 0), 100)) / 100;
  const equity = Math.max(price - loan, 1);
  const annualDebtService = (loan * Math.max(i.ratePct, 0)) / 100; // interest-only
  const noi = Math.max(i.noi, 0);
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;
  const g = (i.noiGrowthPct ?? 2.5) / 100;
  const goingInCap = price > 0 ? noi / price : 0.06;
  const exitCap = i.exitCapPct && i.exitCapPct > 0 ? i.exitCapPct / 100 : goingInCap || 0.06;
  const hold = Math.max(1, Math.floor(i.holdYears));

  // Levered cash flows: -equity now, NOI − debt service each year, plus net sale at exit.
  const cashflows: number[] = [-equity];
  for (let t = 1; t <= hold; t++) {
    let cf = noi * Math.pow(1 + g, t - 1) - annualDebtService;
    if (t === hold) {
      const exitNoi = noi * Math.pow(1 + g, hold);
      const salePrice = exitCap > 0 ? exitNoi / exitCap : 0;
      cf += salePrice - loan; // repay loan at sale
    }
    cashflows.push(cf);
  }

  const r = irr(cashflows);
  const irrPct = Number.isFinite(r) ? Math.round(r * 1000) / 10 : 0;
  return {
    dscr: Math.round(dscr * 100) / 100,
    irrPct,
    annualDebtService: Math.round(annualDebtService),
    equity: Math.round(equity),
    exitCapPct: Math.round(exitCap * 1000) / 10,
  };
}
