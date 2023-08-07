/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The p-value threshold to be used for statistically significant items.
 */
export const LOG_RATE_ANALYSIS_P_VALUE_THRESHOLD = 0.02;

/**
 * The type of log rate analysis (spike or dip) will affect how parameters are
 * passed to the analysis API endpoint.
 */
export const LOG_RATE_ANALYSIS_TYPE = {
  SPIKE: 'spike',
  DIP: 'dip',
} as const;
/**
 * Union type of log rate analysis types.
 */
export type LogRateAnalysisType =
  typeof LOG_RATE_ANALYSIS_TYPE[keyof typeof LOG_RATE_ANALYSIS_TYPE];

/**
 * For the technical preview of Log Rate Analysis we use a hard coded seed.
 * In future versions we might use a user specific seed or let the user customise it.
 */
export const RANDOM_SAMPLER_SEED = 3867412;
