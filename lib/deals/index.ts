/**
 * Deals module — the deal-intake contract, shared by the API and the form.
 */
import { z } from 'zod';

/** Upper bound on the pasted deal package (~200 KB) — caps LLM cost and memory. */
export const MAX_DOCUMENT_CHARS = 200_000;

export const DealInputSchema = z.object({
  title: z.string().min(3).max(200),
  acquisition_type: z.enum(['residential', 'commercial', 'mixed_use', 'development']),
  intended_use: z.string().min(3).max(300),
  purchase_price: z.number().positive().max(1e12),
  financing_ltv: z.number().min(0).max(100),
  financing_rate: z.number().min(0).max(100),
  hold_period_years: z.number().int().positive().max(100),
  /** The deal package: paste title deed, purchase contract, inspection, disclosures, … */
  documents: z.string().min(40).max(MAX_DOCUMENT_CHARS),
});

export type DealInput = z.infer<typeof DealInputSchema>;
