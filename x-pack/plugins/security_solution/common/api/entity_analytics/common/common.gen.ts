/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from 'zod';

/*
 * NOTICE: Do not edit this file manually.
 * This file is automatically generated by the OpenAPI Generator, @kbn/openapi-generator.
 */

export type EntityAnalyticsPrivileges = z.infer<typeof EntityAnalyticsPrivileges>;
export const EntityAnalyticsPrivileges = z.object({
  has_all_required: z.boolean(),
  privileges: z.object({
    elasticsearch: z.object({
      cluster: z
        .object({
          manage_index_templates: z.boolean().optional(),
          manage_transform: z.boolean().optional(),
        })
        .optional(),
      index: z
        .object({})
        .catchall(
          z.object({
            read: z.boolean().optional(),
            write: z.boolean().optional(),
          })
        )
        .optional(),
    }),
  }),
});

export type AfterKeys = z.infer<typeof AfterKeys>;
export const AfterKeys = z.object({
  host: z.object({}).catchall(z.string()).optional(),
  user: z.object({}).catchall(z.string()).optional(),
});

/**
 * The identifier of the Kibana data view to be used when generating risk scores.
 */
export type DataViewId = z.infer<typeof DataViewId>;
export const DataViewId = z.string();

/**
 * An elasticsearch DSL filter object. Used to filter the risk inputs involved, which implicitly filters the risk scores themselves.
 */
export type Filter = z.infer<typeof Filter>;
export const Filter = z.object({});

/**
 * Specifies how many scores will be involved in a given calculation. Note that this value is per `identifier_type`, i.e. a value of 10 will calculate 10 host scores and 10 user scores, if available. To avoid missed data, keep this value consistent while paginating through scores.
 */
export type PageSize = z.infer<typeof PageSize>;
export const PageSize = z.number().default(1000);

export type KibanaDate = z.infer<typeof KibanaDate>;
export const KibanaDate = z.string();

/**
 * Defines the time period on which risk inputs will be filtered.
 */
export type DateRange = z.infer<typeof DateRange>;
export const DateRange = z.object({
  start: KibanaDate,
  end: KibanaDate,
});

export type IdentifierType = z.infer<typeof IdentifierType>;
export const IdentifierType = z.enum(['host', 'user']);
export type IdentifierTypeEnum = typeof IdentifierType.enum;
export const IdentifierTypeEnum = IdentifierType.enum;

/**
 * A generic representation of a document contributing to a Risk Score.
 */
export type RiskScoreInput = z.infer<typeof RiskScoreInput>;
export const RiskScoreInput = z.object({
  /**
   * The unique identifier (`_id`) of the original source document
   */
  id: z.string().optional(),
  /**
   * The unique index (`_index`) of the original source document
   */
  index: z.string().optional(),
  /**
   * The risk category of the risk input document.
   */
  category: z.string().optional(),
  /**
   * A human-readable description of the risk input document.
   */
  description: z.string().optional(),
  /**
   * The weighted risk score of the risk input document.
   */
  risk_score: z.number().min(0).max(100).optional(),
  /**
   * The @timestamp of the risk input document.
   */
  timestamp: z.string().optional(),
});

export type RiskScore = z.infer<typeof RiskScore>;
export const RiskScore = z.object({
  /**
   * The time at which the risk score was calculated.
   */
  '@timestamp': z.string().datetime(),
  /**
   * The identifier field defining this risk score. Coupled with `id_value`, uniquely identifies the entity being scored.
   */
  id_field: z.string(),
  /**
   * The identifier value defining this risk score. Coupled with `id_field`, uniquely identifies the entity being scored.
   */
  id_value: z.string(),
  /**
   * Lexical description of the entity's risk.
   */
  calculated_level: z.string(),
  /**
   * The raw numeric value of the given entity's risk score.
   */
  calculated_score: z.number(),
  /**
   * The normalized numeric value of the given entity's risk score. Useful for comparing with other entities.
   */
  calculated_score_norm: z.number().min(0).max(100),
  /**
   * The contribution of Category 1 to the overall risk score (`calculated_score`). Category 1 contains Detection Engine Alerts.
   */
  category_1_score: z.number(),
  /**
   * The number of risk input documents that contributed to the Category 1 score (`category_1_score`).
   */
  category_1_count: z.number(),
  /**
   * A list of the highest-risk documents contributing to this risk score. Useful for investigative purposes.
   */
  inputs: z.array(RiskScoreInput),
});

/**
 * Configuration used to tune risk scoring. Weights can be used to change the score contribution of risk inputs for hosts and users at both a global level and also for Risk Input categories (e.g. 'category_1').
 */
export type RiskScoreWeight = z.infer<typeof RiskScoreWeight>;
export const RiskScoreWeight = z.object({
  type: z.string(),
  value: z.string().optional(),
  host: z.number().min(0).max(1).optional(),
  user: z.number().min(0).max(1).optional(),
});

/**
 * A list of weights to be applied to the scoring calculation.
 */
export type RiskScoreWeights = z.infer<typeof RiskScoreWeights>;
export const RiskScoreWeights = z.array(RiskScoreWeight);

export type RiskEngineInitStep = z.infer<typeof RiskEngineInitStep>;
export const RiskEngineInitStep = z.object({
  type: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});
