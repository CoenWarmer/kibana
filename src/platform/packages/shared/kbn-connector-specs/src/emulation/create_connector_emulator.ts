/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs/promises';
import path from 'path';
import type { ContractCall, ResponseFixture } from '@kbn/connector-emulate';
import type { ConnectorSpec } from '../connector_spec';
import type { ManifestOperation } from '../test/vendor_api/manifest';

const SPECS_DIRECTORY = path.resolve(__dirname, '../specs');
const MAX_REPORTED_VIOLATIONS = 10;

/** A vendor response set by the caller, which has to match the vendor's API. */
export interface EmulatedVendorResponse {
  /** Defaults to the operation's lowest declared success status. */
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  /** `METHOD /path`, which actions that call several vendor operations have to name. */
  readonly operation?: string;
}

export type EmulatedActionResult =
  | { readonly status: 'ok'; readonly data: unknown; readonly calls: readonly ContractCall[] }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly calls: readonly ContractCall[];
      /** The vendor API has no contract for this, so nothing can answer or validate it. */
      readonly notEmulatable?: true;
    };

export interface ConnectorEmulator {
  readonly runAction: (
    action: string,
    input: unknown,
    response?: EmulatedVendorResponse
  ) => Promise<EmulatedActionResult>;
}

/** The connector can't be emulated, so nothing was run. */
export class ConnectorNotEmulatableError extends Error {}

/** Spec folders are named after the connector id, with underscores for its hyphens. */
export const getVendorApiDirectory = ({ metadata: { id } }: ConnectorSpec): string =>
  path.join(SPECS_DIRECTORY, id.replace(/^\./, '').replace(/-/g, '_'), 'vendor_api');

const exists = async (file: string): Promise<boolean> => {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
};

const isUnmatchedCall = ({ matched, operation, status }: ContractCall): boolean =>
  matched === undefined && operation === undefined && (status === 404 || status === 405);

const describeViolations = (calls: readonly ContractCall[]): string[] =>
  calls.flatMap(({ request, status, requestViolations }) =>
    requestViolations.length > 0
      ? [`${status} ${request}: ${requestViolations.map(({ message }) => message).join('; ')}`]
      : []
  );

const toOperationLabel = ({ method, path: operationPath }: ManifestOperation): string =>
  `${method.toUpperCase()} ${operationPath}`;

const isSameOperation = (
  { source, method, path: operationPath }: ManifestOperation,
  other: { readonly source?: string; readonly method?: string; readonly path?: string } | undefined
): boolean =>
  other !== undefined &&
  other.method?.toLowerCase() === method.toLowerCase() &&
  other.path === operationPath &&
  (other.source === undefined || other.source === source);

const lowestSuccessStatus = (responses: Record<string, unknown> | undefined): number => {
  const statuses = Object.keys(responses ?? {})
    .map(Number)
    .filter((status) => status >= 200 && status < 300);
  return statuses.length > 0 ? Math.min(...statuses) : 200;
};

/**
 * Creates an emulator that runs a connector's real handlers against its committed vendor API
 * snapshot. Every request is answered in memory, so no vendor is contacted and no credentials or
 * connector instance are needed.
 */
export const createConnectorEmulator = async (
  connector: ConnectorSpec
): Promise<ConnectorEmulator> => {
  const directory = getVendorApiDirectory(connector);
  const { id } = connector.metadata;
  if (!(await exists(path.join(directory, 'manifest.json')))) {
    throw new ConnectorNotEmulatableError(`${id} has no recorded vendor API to emulate`);
  }

  // Loaded on first use: Kibana imports this module, the emulator only runs when asked for.
  const [{ createContractContext }, specsModule, fixturesModule, { sampleConfig }] =
    await Promise.all([
      import('../test/create_contract_context'),
      import('../test/vendor_api/load_vendor_specs'),
      import('../test/vendor_api/fixtures'),
      import('../test/vendor_api/record_actions'),
    ]);
  const { FIXTURES, loadVendorSpecs, readOptional } = specsModule;
  const { toResponseFixtures, vendorApiFixturesSchema } = fixturesModule;

  const { manifest, specs, pagination } = await loadVendorSpecs({
    directory,
    // Only committed snapshots are used: an emulated run never fetches anything.
    fetchText: async (url) => {
      throw new ConnectorNotEmulatableError(`${id} has no snapshot of ${url}`);
    },
    log: { info: () => {}, warning: () => {} },
  });
  const fixturesText = await readOptional(path.join(directory, FIXTURES));
  const fixtures = vendorApiFixturesSchema.parse(fixturesText ? JSON.parse(fixturesText) : {});
  const config = await sampleConfig(connector);

  const findOperation = (
    action: string,
    requested: string | undefined
  ): ManifestOperation | { readonly problem: string; readonly notEmulatable?: true } => {
    const operations = manifest.operations[action] ?? [];
    const labels = operations.map(toOperationLabel).join(', ');
    if (operations.length === 0) {
      return {
        problem: `${id}.${action} calls no operation of its vendor API snapshot, so a vendor response can't be validated.`,
        notEmulatable: true,
      };
    }
    if (requested !== undefined) {
      const wanted = requested.trim().toUpperCase();
      return (
        operations.find((operation) => toOperationLabel(operation).toUpperCase() === wanted) ?? {
          problem: `${id}.${action} doesn't call ${requested}. It calls: ${labels}.`,
        }
      );
    }
    return operations.length === 1
      ? operations[0]
      : { problem: `${id}.${action} calls several operations; name one of: ${labels}.` };
  };

  const toAuthoredFixture = (
    operation: ManifestOperation,
    { status, headers, body }: EmulatedVendorResponse
  ): ResponseFixture => {
    const document = specs[operation.source] as {
      paths?: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
    };
    const declared = document.paths?.[operation.path]?.[operation.method.toLowerCase()]?.responses;
    return {
      operation: { source: operation.source, method: operation.method, path: operation.path },
      response: {
        status: status ?? lowestSuccessStatus(declared),
        ...(headers === undefined ? {} : { headers }),
        body,
      },
    };
  };

  return {
    runAction: async (action, input, response) => {
      const fixture = fixtures[action] ?? {};
      const operation = response ? findOperation(action, response.operation) : undefined;
      if (operation && 'problem' in operation) {
        return {
          status: 'error',
          message: operation.problem,
          calls: [],
          ...(operation.notEmulatable ? { notEmulatable: true as const } : {}),
        };
      }

      const { mock, runAction } = await createContractContext({
        connector,
        config: { ...config, ...fixture.config },
        specs,
        // Paging would multiply and renumber the items of a response that was set on purpose.
        pagination: operation
          ? pagination.filter(({ operation: paged }) => !isSameOperation(operation, paged))
          : pagination,
        // The first fixture of an operation wins, so the caller's replaces the committed one.
        fixtures: [
          ...(operation && response ? [toAuthoredFixture(operation, response)] : []),
          ...toResponseFixtures(fixture.responses),
        ],
        // Patching the global fetch would break everything else running on this server. Auth types
        // and handlers that use fetch directly get the emulator's through `fetchTestOnly`.
        guardGlobalFetch: false,
      });
      const getCalls = () => mock.calls.filter(({ token }) => !token);

      let outcome: { readonly data: unknown } | { readonly error: unknown };
      try {
        outcome = { data: await runAction(action, input) };
      } catch (error) {
        outcome = { error };
      }
      const calls = getCalls();

      if (operation) {
        // Any vendor can answer with an error its spec doesn't list, such as a 429 or a 503.
        const violations = calls
          .filter(({ matched }) =>
            isSameOperation(operation, matched as Parameters<typeof isSameOperation>[1])
          )
          .flatMap(({ status, responseViolations }) =>
            responseViolations.filter(({ code }) => !(code === 'status' && status >= 400))
          );
        if (violations.length > 0) {
          const reported = violations.slice(0, MAX_REPORTED_VIOLATIONS);
          const hidden = violations.length - reported.length;
          return {
            status: 'error',
            message: [
              `The response set for ${id}.${action} doesn't match ${toOperationLabel(operation)}:`,
              ...reported.map(({ message }) => `- ${message}`),
              ...(hidden > 0 ? [`- and ${hidden} more`] : []),
            ].join('\n'),
            calls,
          };
        }
      }

      if ('data' in outcome) {
        return { status: 'ok', data: outcome.data, calls };
      }

      const unmatched = calls.filter(isUnmatchedCall);
      if (unmatched.length > 0) {
        // The emulator has no contract for this request, so the failure says nothing about the
        // connector or the vendor. Say that, instead of passing on the emulator's 404.
        const reasons = (manifest.unmatched?.[action] ?? []).map(({ reason }) => reason);
        return {
          status: 'error',
          message: [
            `${id}.${action} can't be emulated: its vendor API snapshot has no ${unmatched
              .map(({ request }) => request)
              .join(', ')}.`,
            ...reasons,
          ].join('\n'),
          calls,
          notEmulatable: true,
        };
      }
      const { error } = outcome;
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'error',
        message: [message, ...describeViolations(calls)].join('\n'),
        calls,
      };
    },
  };
};
