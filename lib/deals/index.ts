/**
 * Deals module — the deal-intake contract, shared by the API and the form.
 */
import { z } from 'zod';

export const DealInputSchema = z.object({
  title: z.string().min(3),
  acquisition_type: z.enum(['residential', 'commercial', 'mixed_use', 'development']),
  intended_use: z.string().min(3),
  purchase_price: z.number().positive(),
  financing_ltv: z.number().min(0).max(100),
  financing_rate: z.number().min(0).max(100),
  hold_period_years: z.number().int().positive(),
  /** The deal package: paste title deed, purchase contract, inspection, disclosures, … */
  documents: z.string().min(40),
});

export type DealInput = z.infer<typeof DealInputSchema>;
