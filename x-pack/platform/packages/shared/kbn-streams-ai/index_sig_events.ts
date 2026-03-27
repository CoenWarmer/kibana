/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Sig-events-specific re-exports from kbn-streams-ai.
 * Owned by @elastic/obs-sig-events-team.
 */

export { generateSignificantEvents } from './src/significant_events/generate_significant_events';
export {
  createDefaultSignificantEventsToolUsage,
  type SignificantEventsToolUsage,
} from './src/significant_events/tools/tool_usage';

export {
  searchKnowledgeIndicators,
  DEFAULT_SEARCH_KNOWLEDGE_INDICATORS_LIMIT,
} from './src/knowledge_indicators/search';
export {
  featureToKnowledgeIndicatorFeature,
  queryLinkToKnowledgeIndicatorQuery,
} from './src/knowledge_indicators/mappers';
export type {
  SearchKnowledgeIndicatorsInput,
  SearchKnowledgeIndicatorsKind,
  SearchKnowledgeIndicatorsOutput,
  KnowledgeIndicator,
  KnowledgeIndicatorFeature,
  KnowledgeIndicatorQuery,
} from './src/knowledge_indicators/types';
