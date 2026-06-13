import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
  uuid,
  unique,
} from 'drizzle-orm/pg-core';

/**
 * Deal under evaluation — the committee's input.
 */
export const dealBriefs = pgTable('deal_briefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  property_type: text('property_type').notNull(),
  location: text('location').notNull(),
  size_sqft: integer('size_sqft').notNull(),
  asking_price: numeric('asking_price', { precision: 14, scale: 2 }).notNull(),
  occupancy_pct: numeric('occupancy_pct', { precision: 5, scale: 2 }).notNull(),
  cap_rate_stabilized: numeric('cap_rate_stabilized', { precision: 5, scale: 2 }).notNull(),
  financing_ltv: numeric('financing_ltv', { precision: 5, scale: 2 }).notNull(),
  financing_rate: numeric('financing_rate', { precision: 5, scale: 2 }).notNull(),
  hold_period_years: integer('hold_period_years').notNull(),
  business_context: text('business_context').notNull(),
  additional_notes: text('additional_notes'),
  submitter_id: text('submitter_id').notNull().default('demo-user'),
  status: text('status').notNull().default('pending'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/**
 * The Band room backing a deal. Maps our deal to the Band room + participants.
 */
export const bandRooms = pgTable('band_rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  deal_id: uuid('deal_id').notNull().unique().references(() => dealBriefs.id, { onDelete: 'cascade' }),
  band_room_id: text('band_room_id').notNull().unique(),
  participant_map: jsonb('participant_map').$type<Record<string, string>>().notNull().default({}),
  room_status: text('room_status').notNull().default('active'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
});

/**
 * One agent's evaluation of a deal (summary + raw structured output).
 */
export const agentEvaluations = pgTable('agent_evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  deal_id: uuid('deal_id').notNull().references(() => dealBriefs.id, { onDelete: 'cascade' }),
  agent_type: text('agent_type').notNull(),
  execution_phase: text('execution_phase').notNull().default('evaluation'),
  status: text('status').notNull(),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  summary: text('summary'),
  raw_output: jsonb('raw_output').$type<Record<string, unknown>>().notNull(),
  band_message_id: text('band_message_id'),
  model_used: text('model_used'),
  provider_used: text('provider_used'),
  execution_time_ms: integer('execution_time_ms'),
  attempt_count: integer('attempt_count').default(1),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  unique_deal_agent_phase: unique().on(table.deal_id, table.agent_type, table.execution_phase),
}));

/**
 * Normalized per-claim findings. Lets contradictions and handoffs reference
 * discrete rows (with provenance + evidence) rather than prose summaries.
 */
export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  deal_id: uuid('deal_id').notNull().references(() => dealBriefs.id, { onDelete: 'cascade' }),
  agent_type: text('agent_type').notNull(),
  claim: text('claim').notNull(),
  severity: text('severity').notNull(), // critical | material | minor
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  evidence: jsonb('evidence').$type<string[]>().default([]),
  source_document: text('source_document'),
  band_message_id: text('band_message_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * Agent-to-agent handoff edges. Each row is a Band @mention from one agent to
 * another, with the reason — the record of collaboration flowing through Band.
 */
export const mentions = pgTable('mentions', {
  id: uuid('id').primaryKey().defaultRandom(),
  deal_id: uuid('deal_id').notNull().references(() => dealBriefs.id, { onDelete: 'cascade' }),
  from_agent: text('from_agent').notNull(),
  to_agent: text('to_agent').notNull(),
  reason: text('reason'),
  band_message_id: text('band_message_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * A negotiation round when agents disagree.
 */
export const negotiationRounds = pgTable('negotiation_rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  deal_id: uuid('deal_id').notNull().references(() => dealBriefs.id, { onDelete: 'cascade' }),
  round_number: integer('round_number').notNull(),
  conflicting_agents: jsonb('conflicting_agents').$type<string[]>().notNull(),
  round_messages: jsonb('round_messages').$type<unknown[]>().notNull().default([]),
  consensus_reached: boolean('consensus_reached').notNull().default(false),
  conditions_emerged: jsonb('conditions_emerged').$type<string[]>().default([]),
  resolution_summary: text('resolution_summary'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  unique_deal_round: unique().on(table.deal_id, table.round_number),
}));

/**
 * The human's final decision on a deal.
 */
export const finalDecisions = pgTable('final_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  deal_id: uuid('deal_id').notNull().unique().references(() => dealBriefs.id, { onDelete: 'cascade' }),
  final_status: text('final_status').notNull(),
  decided_by: text('decided_by'),
  executive_summary: text('executive_summary'),
  negotiated_conditions: jsonb('negotiated_conditions').$type<string[]>().default([]),
  human_conditions: jsonb('human_conditions').$type<string[]>().default([]),
  all_conditions: jsonb('all_conditions').$type<string[]>().default([]),
  rejection_reason: text('rejection_reason'),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * Append-only audit trail — every workflow state transition and agent action.
 */
export const workflowEvents = pgTable('workflow_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  deal_id: uuid('deal_id').notNull().references(() => dealBriefs.id, { onDelete: 'cascade' }),
  event_type: text('event_type').notNull(),
  from_status: text('from_status'),
  to_status: text('to_status'),
  agent_type: text('agent_type'),
  triggered_by: text('triggered_by').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * Idempotency guard so an agent runs at most once per (deal, phase).
 */
export const agentExecutionLocks = pgTable('agent_execution_locks', {
  execution_key: text('execution_key').primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
