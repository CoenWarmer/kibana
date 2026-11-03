/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { existsSync, readdirSync } from 'fs';
import path from 'path';
import * as connectorSpecs from '../all_specs';
import type { ConnectorSpec } from '../connector_spec';
import {
  ConnectorNotEmulatableError,
  createConnectorEmulator,
  getVendorApiDirectory,
} from './create_connector_emulator';

const connectors = Object.values(connectorSpecs) as ConnectorSpec[];
const findConnector = (id: string): ConnectorSpec => {
  const connector = connectors.find(({ metadata }) => metadata.id === id);
  if (!connector) {
    throw new Error(`No connector ${id}`);
  }
  return connector;
};

describe('createConnectorEmulator', () => {
  const globalFetch = globalThis.fetch;
  const fetchSpy = jest.fn(async () => {
    throw new Error('The emulator called the global fetch');
  });

  beforeEach(() => {
    fetchSpy.mockClear();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = globalFetch;
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('runs the handler against the snapshot and reports the calls', async () => {
    const emulator = await createConnectorEmulator(findConnector('.datadog'));

    const result = await emulator.runAction('listMonitors', {});

    expect(result.status).toBe('ok');
    expect(result.calls).toEqual([
      expect.objectContaining({ status: 200, requestViolations: [], responseViolations: [] }),
    ]);
  });

  it('leaves the global fetch in place, as other code shares the process', async () => {
    const emulator = await createConnectorEmulator(findConnector('.datadog'));
    let fetchDuringRun: typeof fetch | undefined;
    const { getMonitor } = findConnector('.datadog').actions;
    const handler = jest.spyOn(getMonitor, 'handler').mockImplementationOnce(async () => {
      fetchDuringRun = globalThis.fetch;
      return {};
    });

    await emulator.runAction('getMonitor', { monitorId: 1 });

    expect(fetchDuringRun).toBe(fetchSpy);
    handler.mockRestore();
  });

  it('exchanges tokens through the emulator for auth types that use fetch directly', async () => {
    const emulator = await createConnectorEmulator(findConnector('.google_cloud_monitoring'));

    const result = await emulator.runAction('listAlertPolicies', {});

    expect(result.status).toBe('ok');
  });

  it('reports what the vendor API rejected', async () => {
    const connector = findConnector('.datadog');
    const emulator = await createConnectorEmulator(connector);
    const handler = jest
      .spyOn(connector.actions.listMonitors, 'handler')
      .mockImplementationOnce(async ({ client }) =>
        client.get('https://api.datadoghq.com/api/v1/monitor', {
          headers: { 'DD-API-KEY': 'key', 'DD-APPLICATION-KEY': 'key' },
          params: { page_size: 100000 },
        })
      );

    const result = await emulator.runAction('listMonitors', {});

    handler.mockRestore();
    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.message).toContain('page_size');
  });

  it('returns invalid input as an error instead of throwing', async () => {
    const emulator = await createConnectorEmulator(findConnector('.datadog'));

    const result = await emulator.runAction('getMonitor', { monitorId: 'not-a-number' });

    expect(result).toEqual(expect.objectContaining({ status: 'error', calls: [] }));
  });

  it('returns an unknown action as an error', async () => {
    const emulator = await createConnectorEmulator(findConnector('.datadog'));

    const result = await emulator.runAction('noSuchAction', {});

    expect(result).toEqual(expect.objectContaining({ status: 'error', calls: [] }));
  });

  it('refuses connectors without a recorded vendor API', async () => {
    const unrecorded = connectors.find(
      (connector) => !existsSync(path.join(getVendorApiDirectory(connector), 'manifest.json'))
    );

    await expect(createConnectorEmulator(unrecorded as ConnectorSpec)).rejects.toBeInstanceOf(
      ConnectorNotEmulatableError
    );
  });

  it('finds the vendor API folder of every recorded connector', () => {
    const specsDirectory = path.resolve(__dirname, '../specs');
    const recorded = readdirSync(specsDirectory)
      .map((name) => path.join(specsDirectory, name, 'vendor_api'))
      .filter((directory) => existsSync(path.join(directory, 'manifest.json')));

    const found = new Set(connectors.map(getVendorApiDirectory));

    expect(recorded.filter((directory) => !found.has(directory))).toEqual([]);
  });
});
