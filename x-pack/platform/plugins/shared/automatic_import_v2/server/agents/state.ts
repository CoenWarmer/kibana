/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { MessagesZodMeta } from '@langchain/langgraph';
import { registry } from '@langchain/langgraph/zod';
import { z } from '@kbn/zod/v4';
import type { estypes } from '@elastic/elasticsearch';

export const AutomaticImportAgentState = z.object({
  messages: z.custom<BaseMessage[]>().register(registry, MessagesZodMeta),
  current_pipeline: z
    .object({
      processors: z.array(z.any()).describe('The processors in the pipeline'),
      on_failure: z
        .array(z.any())
        .optional()
        .describe('Optional failure handlers for the pipeline'),
    })
    .describe('The generated ingest pipeline to validate'),
  pipeline_generation_results: z
    .array(z.custom<estypes.IngestSimulateDocumentResult>())
    .default([]),
  failure_count: z.number().min(0).default(0),
  pipeline_validation_results: z
    .object({
      success_rate: z.number().min(0).max(100).default(100),
      successful_samples: z.number().min(0).default(0),
      failed_samples: z.number().min(0).default(0),
      total_samples: z.number().min(0).default(0),
      failure_details: z
        .array(
          z.object({
            error: z.string(),
            sample: z.string(),
          })
        )
        .max(100)
        .default([]),
    })
    .default({
      success_rate: 100,
      successful_samples: 0,
      failed_samples: 0,
      total_samples: 0,
      failure_details: [],
    }),
});

export type AutomaticImportAgentStateType = z.infer<typeof AutomaticImportAgentState>;
