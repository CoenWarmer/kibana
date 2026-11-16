/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildSchema, graphqlSync, getIntrospectionQuery } from 'graphql';
import { projectGraphQLSchema, toGraphQLSdl } from './graphql_source';

const sdl = `
  type Query { boards: [Board!]!, users: [User!]!, node(id: ID!): Node }
  type Mutation { archiveItem(itemId: ID!): Item, deleteUser(id: ID!): Boolean }
  interface Node { id: ID! }
  type Board implements Node { id: ID!, items: [Item!]! }
  type Item implements Node { id: ID!, name: String! }
  type User implements Node { id: ID!, email: String! }
`;

const typesOf = (projected: string) =>
  [...projected.matchAll(/^(?:type|interface) (\w+)/gm)].map(([, name]) => name).sort();

describe('projectGraphQLSchema', () => {
  it('keeps the root fields the actions call and the types they reach', () => {
    const projected = projectGraphQLSchema(sdl, [
      { method: 'query', path: 'boards' },
      { method: 'mutation', path: 'archiveItem' },
    ]);

    expect(typesOf(projected)).toEqual(['Board', 'Item', 'Mutation', 'Node', 'Query']);
    expect(projected).toContain('type Query {\n  boards: [Board!]!\n}');
    expect(projected).toContain('type Mutation {\n  archiveItem(itemId: ID!): Item\n}');
  });

  it("keeps the implementations of an interface the root fields return, which they don't name", () => {
    expect(typesOf(projectGraphQLSchema(sdl, [{ method: 'query', path: 'node' }]))).toEqual([
      'Board',
      'Item',
      'Node',
      'Query',
      'User',
    ]);
  });

  it('keeps a query field when the actions only run mutations, as a schema needs one', () => {
    const projected = projectGraphQLSchema(sdl, [{ method: 'mutation', path: 'deleteUser' }]);

    expect(() => buildSchema(projected)).not.toThrow();
    expect(projected).toContain('type Mutation {\n  deleteUser(id: ID!): Boolean\n}');
  });
});

describe('toGraphQLSdl', () => {
  it('turns an introspection result into SDL, and keeps SDL as it is', () => {
    const introspection = JSON.stringify(
      graphqlSync({ schema: buildSchema(sdl), source: getIntrospectionQuery() })
    );

    expect(typesOf(toGraphQLSdl(introspection))).toEqual([
      'Board',
      'Item',
      'Mutation',
      'Node',
      'Query',
      'User',
    ]);
    expect(toGraphQLSdl(sdl)).toBe(sdl);
  });
});
