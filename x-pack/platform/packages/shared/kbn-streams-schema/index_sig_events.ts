/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Sig-events-specific re-exports from kbn-streams-schema.
 * Owned by @elastic/obs-sig-events-team.
 */

export type {
  SignificantEventsResponse,
  SignificantEventsGetResponse,
  SignificantEventsPreviewResponse,
  SignificantEventsGenerateResponse,
  GeneratedSignificantEventQuery,
  SignificantEventsQueriesGenerationResult,
  SignificantEventsQueriesGenerationTaskResult,
} from './src/api/significant_events';

export {
  type EsqlQuery,
  esqlQuerySchema,
  type StreamQuery,
  type QueryLink,
  type QueriesGetResponse,
  type QueriesOccurrencesGetResponse,
  upsertStreamQueryRequestSchema,
  streamQuerySchema,
} from './src/queries';

export {
  type GenerateInsightsResult,
  type Insight,
  type InsightCore,
  type InsightEvidence,
  type InsightImpactLevel,
  type InsightImpactLevelNumeric,
  type InsightUserEvaluation,
  type InsightMeta,
  type SaveInsightBody,
  insightSchema,
  insightCoreSchema,
  insightMetaSchema,
  insightEvidenceSchema,
  insightImpactLevelSchema,
  insightImpactLevelNumericSchema,
  insightUserEvaluationSchema,
  INSIGHT_IMPACT_LEVEL_MAP,
  getImpactLevel,
} from './src/insights';
