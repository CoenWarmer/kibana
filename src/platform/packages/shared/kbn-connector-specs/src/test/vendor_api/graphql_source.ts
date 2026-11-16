/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { GraphQLNamedType, GraphQLSchema, IntrospectionQuery } from 'graphql';
import {
  buildClientSchema,
  buildSchema,
  getNamedType,
  GraphQLObjectType,
  GraphQLSchema as Schema,
  isInterfaceType,
  isObjectType,
  lexicographicSortSchema,
  printSchema,
} from 'graphql';

/** A GraphQL root field an action calls, as the manifest records it. */
export interface GraphQLRootField {
  /** The operation type: `query` or `mutation`. */
  readonly method: string;
  /** The root field. */
  readonly path: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// An introspection result, as `{ data: { __schema } }` or `{ __schema }`.
const introspectionOf = (text: string): IntrospectionQuery | undefined => {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{')) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const result = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed;
    return isRecord(result) && isRecord(result.__schema)
      ? (result as unknown as IntrospectionQuery)
      : undefined;
  } catch {
    return undefined;
  }
};

/** Builds a vendor's GraphQL schema from SDL or from the result of an introspection query. */
export const buildGraphQLSchema = (text: string): GraphQLSchema => {
  const introspection = introspectionOf(text);
  return introspection ? buildClientSchema(introspection) : buildSchema(text);
};

/** A vendor's GraphQL schema as SDL, whether it publishes SDL or an introspection result. */
export const toGraphQLSdl = (text: string): string =>
  introspectionOf(text) ? printSchema(buildGraphQLSchema(text)) : text;

const pickFields = (
  root: GraphQLObjectType | null | undefined,
  names: ReadonlySet<string>,
  keepOne: boolean
): GraphQLObjectType | undefined => {
  if (!root) {
    return undefined;
  }
  const config = root.toConfig();
  const fields = Object.entries(config.fields).filter(([name]) => names.has(name));
  // A schema needs a query type with a field, though the actions may only run mutations.
  const kept = fields.length === 0 && keepOne ? Object.entries(config.fields).slice(0, 1) : fields;
  return kept.length === 0
    ? undefined
    : new GraphQLObjectType({ ...config, fields: Object.fromEntries(kept) });
};

/**
 * The schema trimmed to the root fields the actions call and the types they reach, including the
 * implementations of the interfaces among them, sorted so that its SDL changes only with them.
 */
export const projectGraphQLSchema = (
  text: string,
  rootFields: readonly GraphQLRootField[]
): string => {
  const schema = buildGraphQLSchema(text);
  const named = (method: string) =>
    new Set(rootFields.filter((field) => field.method === method).map(({ path }) => path));
  const query = pickFields(schema.getQueryType(), named('query'), true);
  const mutation = pickFields(schema.getMutationType(), named('mutation'), false);
  if (!query) {
    throw new Error('The GraphQL schema has no query type');
  }
  let types: GraphQLNamedType[] = [];
  let projected = new Schema({ query, mutation, types });
  // A query may select the implementations of an interface a field returns, which no field names;
  // an interface that types only implement can't be selected that way.
  for (;;) {
    const returned = Object.values(projected.getTypeMap())
      .filter((type) => isObjectType(type) || isInterfaceType(type))
      .flatMap((type) => Object.values(type.getFields()))
      .map((field) => getNamedType(field.type))
      .filter(isInterfaceType);
    const implementations = [...new Set(returned)]
      .flatMap((type) => schema.getPossibleTypes(type))
      .filter(({ name }) => projected.getType(name) === undefined);
    if (implementations.length === 0) {
      break;
    }
    types = [...types, ...implementations];
    projected = new Schema({ query, mutation, types });
  }
  return printSchema(lexicographicSortSchema(projected));
};
