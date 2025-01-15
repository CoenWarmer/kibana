/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * NOTICE: Do not edit this file manually.
 * This file is automatically generated by the OpenAPI Generator, @kbn/openapi-generator.
 *
 * info:
 *   title: Entities List Schema
 *   version: 2023-10-31
 */

import { z } from '@kbn/zod';
import { ArrayFromString } from '@kbn/zod-helpers';

import { EntityType, InspectQuery } from '../common.gen';
import { Entity } from './common.gen';

export type ListEntitiesRequestQuery = z.infer<typeof ListEntitiesRequestQuery>;
export const ListEntitiesRequestQuery = z.object({
  sort_field: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  per_page: z.coerce.number().int().min(1).max(10000).optional(),
  /**
   * An ES query to filter by.
   */
  filterQuery: z.string().optional(),
  entity_types: ArrayFromString(EntityType),
});
export type ListEntitiesRequestQueryInput = z.input<typeof ListEntitiesRequestQuery>;

export type ListEntitiesResponse = z.infer<typeof ListEntitiesResponse>;
export const ListEntitiesResponse = z.object({
  records: z.array(Entity),
  page: z.number().int().min(1),
  per_page: z.number().int().min(1).max(1000),
  total: z.number().int().min(0),
  inspect: InspectQuery.optional(),
});
