/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { findUndeclaredProperties } from './find_undeclared_properties';
import { loadContractOperations } from '.';

const operationWith = (schema: unknown, components: Record<string, unknown> = {}) => {
  const [operation] = loadContractOperations({
    openapi: '3.1.0',
    info: { title: 'Test', version: '1' },
    servers: [{ url: 'https://example.com' }],
    paths: {
      '/thing': {
        get: {
          responses: {
            200: { description: 'ok', content: { 'application/json': { schema } } },
          },
        },
      },
    },
    components: { schemas: components },
  });
  return operation;
};

const undeclared = (schema: unknown, body: unknown, components?: Record<string, unknown>) =>
  findUndeclaredProperties(operationWith(schema, components), { statusCode: 200, body }).map(
    ({ path }) => path.join('.')
  );

const THING = { type: 'object', properties: { name: { type: 'string' } } };

describe('findUndeclaredProperties', () => {
  it('finds a property the schema does not declare, and accepts one it does', () => {
    expect(undeclared(THING, { name: 'a', namess222: 'b' })).toEqual(['body.namess222']);
  });

  it('looks into arrays and nested objects', () => {
    const schema = {
      type: 'array',
      items: { type: 'object', properties: { child: THING } },
    };

    expect(undeclared(schema, [{ child: { name: 'a' } }, { child: { typo: 'b' } }])).toEqual([
      'body.1.child.typo',
    ]);
  });

  it('follows refs', () => {
    expect(
      undeclared({ $ref: '#/components/schemas/Thing' }, { typo: 1 }, { Thing: THING })
    ).toEqual(['body.typo']);
  });

  it('combines the properties of allOf parts', () => {
    const schema = {
      allOf: [THING, { type: 'object', properties: { other: { type: 'string' } } }],
    };

    expect(undeclared(schema, { name: 'a', other: 'b', typo: 'c' })).toEqual(['body.typo']);
  });

  it('accepts a property of any oneOf or anyOf branch', () => {
    const other = { type: 'object', properties: { other: { type: 'string' } } };

    expect(undeclared({ oneOf: [THING, other] }, { name: 'a', other: 'b', typo: 'c' })).toEqual([
      'body.typo',
    ]);
    expect(undeclared({ anyOf: [THING, other] }, { other: 'b' })).toEqual([]);
  });

  it.each([
    ['an object without listed properties', { type: 'object' }],
    ['additionalProperties: true', { ...THING, additionalProperties: true }],
    ['a map', { type: 'object', additionalProperties: { type: 'string' } }],
    ['patternProperties', { ...THING, patternProperties: { '^x-': { type: 'string' } } }],
    ['a free-form oneOf branch', { oneOf: [THING, { type: 'object' }] }],
    ['no schema at all', {}],
  ])('accepts any property for %s', (_label, schema) => {
    expect(undeclared(schema, { anything: 'goes' })).toEqual([]);
  });

  it('looks into the values of a map', () => {
    expect(undeclared({ type: 'object', additionalProperties: THING }, { a: { typo: 1 } })).toEqual(
      ['body.a.typo']
    );
  });

  it('survives recursive schemas', () => {
    const node = {
      type: 'object',
      properties: { name: { type: 'string' }, next: { $ref: '#/components/schemas/Node' } },
    };

    expect(
      undeclared(
        { $ref: '#/components/schemas/Node' },
        { next: { next: { typo: 1 } } },
        { Node: node }
      )
    ).toEqual(['body.next.next.typo']);
  });

  it('ignores a status without a schema', () => {
    expect(
      findUndeclaredProperties(operationWith(THING), { statusCode: 500, body: { typo: 1 } })
    ).toEqual([]);
  });
});
