/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * OAS example constants for the Streams API.
 *
 * These are the single source of truth for all examples referenced in
 * oas_docs/overlays/streams.overlays.yaml. They are typed against the
 * @kbn/streams-schema types so that TypeScript catches any drift between
 * an example and the current schema the moment the schema changes.
 *
 * To regenerate the YAML files consumed by the overlay, run from the Kibana root:
 *   cd oas_docs && npx tsx scripts/generate_examples.ts
 * or:
 *   make -C oas_docs generate-examples
 */

import type { Streams } from '@kbn/streams-schema';

// ---------------------------------------------------------------------------
// PUT /api/streams/{name}  –  wired stream
// ---------------------------------------------------------------------------

export const createWiredStreamRequest: Streams.WiredStream.UpsertRequest = {
  stream: {
    description: 'Web server access logs, routed by severity',
    type: 'wired',
    ingest: {
      lifecycle: { inherit: {} },
      processing: { steps: [] },
      settings: {},
      failure_store: { inherit: {} },
      wired: {
        fields: {
          'host.name': { type: 'keyword' },
          'http.response.status_code': { type: 'long' },
          message: { type: 'match_only_text' },
        },
        routing: [
          {
            destination: 'logs.nginx.errors',
            where: { field: 'http.response.status_code', gte: 500 },
            status: 'enabled',
          },
        ],
      },
    },
  },
  dashboards: [],
  rules: [],
  queries: [],
};

// ---------------------------------------------------------------------------
// PUT /api/streams/{name}  –  classic stream
// ---------------------------------------------------------------------------

export const updateClassicStreamRequest: Streams.ClassicStream.UpsertRequest = {
  stream: {
    description: 'Legacy application logs managed as a classic data stream',
    type: 'classic',
    ingest: {
      lifecycle: { dsl: { data_retention: '30d' } },
      processing: {
        steps: [
          {
            action: 'grok',
            from: 'message',
            patterns: [
              '%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:log.level} %{GREEDYDATA:message}',
            ],
            ignore_missing: true,
          },
        ],
      },
      settings: {},
      failure_store: { disabled: {} },
      classic: {},
    },
  },
  dashboards: [],
  rules: [],
  queries: [],
};

// ---------------------------------------------------------------------------
// PUT /api/streams/{name}  –  query stream
// ---------------------------------------------------------------------------

export const createQueryStreamRequest: Streams.QueryStream.UpsertRequest = {
  stream: {
    description: 'All error-level logs across every stream',
    type: 'query',
    query: {
      view: 'logs.errors-view',
      esql: 'FROM logs* | WHERE log.level == "error"',
    },
  },
  dashboards: [],
  rules: [],
  queries: [],
};

// ---------------------------------------------------------------------------
// POST /api/streams/{name}/_fork
// ---------------------------------------------------------------------------

export interface ForkStreamRequest {
  stream: { name: string };
  where: { field: string; eq: string };
  status?: 'enabled' | 'disabled';
}

export const forkStreamRequest: ForkStreamRequest = {
  stream: { name: 'logs.nginx.errors' },
  where: { field: 'http.response.status_code', eq: '500' },
  status: 'enabled',
};

// ---------------------------------------------------------------------------
// PUT /api/streams/{name}/_ingest  –  wired ingest update with processing
// ---------------------------------------------------------------------------

export interface WiredIngestUpsertRequestBody {
  ingest: {
    lifecycle: { inherit: {} };
    processing: {
      steps: Array<{
        action: 'grok';
        from: string;
        patterns: string[];
        ignore_missing?: boolean;
      }>;
    };
    settings: Record<string, never>;
    failure_store: { inherit: {} };
    wired: {
      fields: Record<string, { type: string }>;
      routing: Array<{
        destination: string;
        where: { field: string; eq: string };
        status: string;
      }>;
    };
  };
}

export const upsertWiredIngestRequest: WiredIngestUpsertRequestBody = {
  ingest: {
    lifecycle: { inherit: {} },
    processing: {
      steps: [
        {
          action: 'grok',
          from: 'message',
          patterns: [
            '%{IPORHOST:client.ip} %{USER:ident} %{USER:auth} \\[%{HTTPDATE:@timestamp}\\] "%{WORD:http.method} %{DATA:url.original} HTTP/%{NUMBER:http.version}" %{NUMBER:http.response.status_code:int} (?:%{NUMBER:http.response.body.bytes:int}|-)',
          ],
          ignore_missing: false,
        },
      ],
    },
    settings: {},
    failure_store: { inherit: {} },
    wired: {
      fields: {
        'client.ip': { type: 'ip' },
        'http.method': { type: 'keyword' },
        'http.response.status_code': { type: 'long' },
        'http.response.body.bytes': { type: 'long' },
        'url.original': { type: 'wildcard' },
      },
      routing: [
        {
          destination: 'logs.nginx.errors',
          where: { field: 'http.response.status_code', eq: '500' },
          status: 'enabled',
        },
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// PUT /api/streams/{name}/_query  –  query stream upsert
// ---------------------------------------------------------------------------

export interface QueryStreamUpsertRequestBody {
  query: {
    esql: string;
  };
}

export const upsertQueryStreamRequest: QueryStreamUpsertRequestBody = {
  query: {
    esql: 'FROM logs* | WHERE log.level == "error" | KEEP @timestamp, message, host.name, log.level',
  },
};

// ---------------------------------------------------------------------------
// GET /api/streams/{name}  –  wired stream response
// ---------------------------------------------------------------------------

export interface WiredStreamGetResponse {
  stream: {
    name: string;
    description: string;
    type: 'wired';
    updated_at: string;
    ingest: {
      lifecycle: { inherit: {} };
      processing: { steps: []; updated_at: string };
      settings: {};
      failure_store: { inherit: {} };
      wired: {
        fields: Record<string, { type: string }>;
        routing: Array<{
          destination: string;
          where: { field: string; gte: number };
          status: string;
        }>;
      };
    };
  };
  dashboards: string[];
  rules: string[];
  queries: [];
  data_stream_exists: boolean;
  inherited_fields: Record<string, { type: string; from: string }>;
  effective_lifecycle: { dsl: { data_retention: string }; from: string };
  effective_settings: {};
  effective_failure_store: { disabled: {}; from: string };
  privileges: {
    manage: boolean;
    monitor: boolean;
    view_index_metadata: boolean;
    lifecycle: boolean;
    simulate: boolean;
    text_structure: boolean;
    read_failure_store: boolean;
    manage_failure_store: boolean;
    create_snapshot_repository: boolean;
  };
}

export const getWiredStreamResponse: WiredStreamGetResponse = {
  stream: {
    name: 'logs.nginx',
    description: 'Web server access logs, routed by severity',
    type: 'wired',
    updated_at: '2025-01-15T10:30:00.000Z',
    ingest: {
      lifecycle: { inherit: {} },
      processing: { steps: [], updated_at: '2025-01-15T10:30:00.000Z' },
      settings: {},
      failure_store: { inherit: {} },
      wired: {
        fields: {
          'host.name': { type: 'keyword' },
          'http.response.status_code': { type: 'long' },
          message: { type: 'match_only_text' },
        },
        routing: [
          {
            destination: 'logs.nginx.errors',
            where: { field: 'http.response.status_code', gte: 500 },
            status: 'enabled',
          },
        ],
      },
    },
  },
  dashboards: [],
  rules: [],
  queries: [],
  data_stream_exists: true,
  inherited_fields: {
    '@timestamp': { type: 'date', from: 'logs' },
    'log.level': { type: 'keyword', from: 'logs' },
  },
  effective_lifecycle: { dsl: { data_retention: '7d' }, from: 'logs' },
  effective_settings: {},
  effective_failure_store: { disabled: {}, from: 'logs' },
  privileges: {
    manage: true,
    monitor: true,
    view_index_metadata: true,
    lifecycle: true,
    simulate: true,
    text_structure: true,
    read_failure_store: true,
    manage_failure_store: true,
    create_snapshot_repository: false,
  },
};

// ---------------------------------------------------------------------------
// GET /api/streams  –  stream list response
// ---------------------------------------------------------------------------

export interface StreamListResponse {
  streams: Array<{
    name: string;
    description: string;
    type: 'wired' | 'classic' | 'query';
    updated_at: string;
  }>;
}

export const listStreamsResponse: StreamListResponse = {
  streams: [
    {
      name: 'logs',
      description: 'Root logs stream',
      type: 'wired',
      updated_at: '2025-01-10T08:00:00.000Z',
    },
    {
      name: 'logs.nginx',
      description: 'Web server access logs, routed by severity',
      type: 'wired',
      updated_at: '2025-01-15T10:30:00.000Z',
    },
    {
      name: 'logs.nginx.errors',
      description: 'HTTP 5xx error logs from nginx',
      type: 'wired',
      updated_at: '2025-01-15T10:30:00.000Z',
    },
    {
      name: 'logs-myapp-default',
      description: 'Legacy application logs',
      type: 'classic',
      updated_at: '2024-12-01T09:00:00.000Z',
    },
    {
      name: 'logs.errors',
      description: 'All error-level logs across every stream',
      type: 'query',
      updated_at: '2025-01-20T14:00:00.000Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// Manifest consumed by oas_docs/scripts/generate_streams_examples.ts
// ---------------------------------------------------------------------------

export const oasExamples: Array<{ filename: string; summary: string; value: unknown }> = [
  {
    filename: 'create_wired_stream_request.yaml',
    summary: 'Create a wired stream with field mappings and routing',
    value: createWiredStreamRequest,
  },
  {
    filename: 'update_classic_stream_request.yaml',
    summary: 'Update a classic stream with grok processing and a 30-day retention policy',
    value: updateClassicStreamRequest,
  },
  {
    filename: 'create_query_stream_request.yaml',
    summary: 'Create a query stream backed by an ES|QL expression',
    value: createQueryStreamRequest,
  },
  {
    filename: 'fork_stream_request.yaml',
    summary: 'Fork a wired stream to create a child stream',
    value: forkStreamRequest,
  },
  {
    filename: 'upsert_wired_ingest_request.yaml',
    summary: 'Update a wired stream ingest configuration with grok processing',
    value: upsertWiredIngestRequest,
  },
  {
    filename: 'upsert_query_stream_request.yaml',
    summary: 'Update the ES|QL query for a query stream',
    value: upsertQueryStreamRequest,
  },
  {
    filename: 'get_wired_stream_response.yaml',
    summary: 'Get a wired stream',
    value: getWiredStreamResponse,
  },
  {
    filename: 'list_streams_response.yaml',
    summary: 'List all streams',
    value: listStreamsResponse,
  },
];
