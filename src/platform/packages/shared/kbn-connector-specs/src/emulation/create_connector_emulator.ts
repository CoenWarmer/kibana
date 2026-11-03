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
import type { ContractCall } from '@kbn/connector-emulate';
import type { ConnectorSpec } from '../connector_spec';

const SPECS_DIRECTORY = path.resolve(__dirname, '../specs');

export type EmulatedActionResult =
  | { readonly status: 'ok'; readonly data: unknown; readonly calls: readonly ContractCall[] }
  | { readonly status: 'error'; readonly message: string; readonly calls: readonly ContractCall[] };

export interface ConnectorEmulator {
  readonly runAction: (action: string, input: unknown) => Promise<EmulatedActionResult>;
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

  return {
    runAction: async (action, input) => {
      const fixture = fixtures[action] ?? {};
      const { mock, runAction } = await createContractContext({
        connector,
        config: { ...config, ...fixture.config },
        specs,
        pagination,
        fixtures: toResponseFixtures(fixture.responses),
        // Patching the global fetch would break everything else running on this server. Auth types
        // and handlers that use fetch directly get the emulator's through `fetchTestOnly`.
        guardGlobalFetch: false,
      });
      const getCalls = () => mock.calls.filter(({ token }) => !token);
      try {
        return { status: 'ok', data: await runAction(action, input), calls: getCalls() };
      } catch (error) {
        const calls = getCalls();
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
          };
        }
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: 'error',
          message: [message, ...describeViolations(calls)].join('\n'),
          calls,
        };
      }
    },
  };
};
