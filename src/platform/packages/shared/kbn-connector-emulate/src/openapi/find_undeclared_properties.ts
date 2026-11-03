/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolveSchemaRef } from './schema_validator';
import { isRecord } from './schema_walk';
import type { SchemaNode } from './schema_walk';
import type { ContractOperation, ContractSpec, Violation } from './types';
import { findResponse } from './validate_response';

const COMBINATORS = ['allOf', 'anyOf', 'oneOf'] as const;

/** Follows refs and combinators to the schemas a value is described by, any of which may apply. */
const flatten = (
  spec: ContractSpec,
  schemas: readonly unknown[],
  seen = new Set<unknown>()
): SchemaNode[] =>
  schemas.flatMap((schema) => {
    if (!isRecord(schema) || seen.has(schema)) {
      return [];
    }
    seen.add(schema);
    const target =
      typeof schema.$ref === 'string' ? resolveSchemaRef(spec, schema.$ref) : undefined;
    return [
      schema,
      ...flatten(spec, [target], seen),
      ...COMBINATORS.flatMap((keyword) => {
        const branches = schema[keyword];
        return Array.isArray(branches) ? flatten(spec, branches, seen) : [];
      }),
    ];
  });

const isExplicitlyOpen = ({
  additionalProperties,
  patternProperties,
  unevaluatedProperties,
}: SchemaNode): boolean =>
  additionalProperties === true ||
  isRecord(additionalProperties) ||
  isRecord(patternProperties) ||
  unevaluatedProperties === true ||
  isRecord(unevaluatedProperties);

const isFreeForm = (node: SchemaNode): boolean =>
  (node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object'))) &&
  !isRecord(node.properties) &&
  !COMBINATORS.some((keyword) => Array.isArray(node[keyword])) &&
  typeof node.$ref !== 'string';

const check = (
  spec: ContractSpec,
  schemas: readonly unknown[],
  value: unknown,
  path: readonly string[]
): Violation[] => {
  const nodes = flatten(spec, schemas);
  if (Array.isArray(value)) {
    const items = nodes.flatMap(({ items: itemSchema }) =>
      isRecord(itemSchema) ? [itemSchema] : []
    );
    return value.flatMap((item, index) => check(spec, items, item, [...path, String(index)]));
  }
  if (!isRecord(value)) {
    return [];
  }

  const described = nodes.filter(({ properties }) => isRecord(properties));
  // An object nothing lists the properties of, or that says it takes others, accepts any.
  const acceptsAny =
    described.length === 0 || nodes.some((node) => isExplicitlyOpen(node) || isFreeForm(node));
  const additional = nodes.flatMap(({ additionalProperties }) =>
    isRecord(additionalProperties) ? [additionalProperties] : []
  );

  return Object.entries(value).flatMap(([key, propertyValue]) => {
    const declared = described.flatMap(({ properties }) => {
      const schema = (properties as SchemaNode)[key];
      return schema === undefined ? [] : [schema];
    });
    if (declared.length > 0 || acceptsAny) {
      return check(spec, [...declared, ...additional], propertyValue, [...path, key]);
    }
    return [
      {
        path: ['body', ...path, key],
        code: 'undeclared',
        message: `Response body at /${[...path, key].join(
          '/'
        )}: Property "${key}" isn't in the vendor's schema.`,
      },
    ];
  });
};

/**
 * Lists the response body's properties that the operation's schema doesn't declare. Vendor schemas
 * rarely forbid others, so validation accepts them, but in a response written by hand they are
 * most likely typos.
 */
export const findUndeclaredProperties = (
  operation: ContractOperation,
  { statusCode, body }: { readonly statusCode: number; readonly body?: unknown }
): Violation[] => {
  const contents = findResponse(operation.responses, statusCode)?.contents ?? [];
  const schema = contents.find(({ mediaType }) => /json/i.test(mediaType))?.schema?.schema;
  return isRecord(schema) ? check(operation.spec, [schema], body, []) : [];
};
