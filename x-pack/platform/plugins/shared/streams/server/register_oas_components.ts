/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Register Streams and Streamlang Zod v4 schemas as stable named OAS components.
 *
 * Call once at plugin setup time. After this runs, the OAS generator will emit
 * `$ref: '#/components/schemas/<Name>'` (e.g. `Condition`, `FieldDefinition`)
 * instead of inlining or using auto-generated names like `_zod_v4_1___schema1`.
 */

import type { OasMetaExtensions } from '@kbn/router-to-openapispec';
import { streamsOasDefinitions } from '@kbn/streams-schema';
import { streamlangOasDefinitions } from '@kbn/streamlang';

/**
 * Schemas that require extra OAS properties beyond what Zod can express.
 * Keyed by the same names as in `streamsOasDefinitions`.
 */
const streamDefinitionExtensions: Record<string, OasMetaExtensions> = {
  StreamDefinition: {
    discriminator: {
      propertyName: 'type',
      mapping: {
        wired: '#/components/schemas/WiredStreamDefinition',
        classic: '#/components/schemas/ClassicStreamDefinition',
        query: '#/components/schemas/QueryStreamDefinition',
      },
    },
  },
};

export function registerStreamsOasComponents() {
  for (const [name, schema] of Object.entries(streamsOasDefinitions)) {
    const openapi = streamDefinitionExtensions[name];
    schema.meta({ id: name, ...(openapi ? { openapi } : {}) });
  }
  for (const [name, schema] of Object.entries(streamlangOasDefinitions)) {
    schema.meta({ id: name });
  }
}
