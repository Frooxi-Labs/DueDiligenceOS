/**
 * Deals module — the deal-brief input contract, shared by the API and the form.
 */
import { z } from 'zod';

export const DealInputSchema = z.object({
  title: z.string().min(3),
  property_type: z.string().min(2),
  location: z.string().min(2),
  size_sqft: z.number().int().positive(),
  asking_price: z.number().positive(),
  occupancy_pct: z.number().min(0).max(100),
  cap_rate_stabilized: z.number().min(0).max(100),
  financing_ltv: z.number().min(0).max(100),
  financing_rate: z.number().min(0).max(100),
  hold_period_years: z.number().int().positive(),
  business_context: z.string().min(20),
  additional_notes: z.string().optional(),
});

export type DealInput = z.infer<typeof DealInputSchema>;
