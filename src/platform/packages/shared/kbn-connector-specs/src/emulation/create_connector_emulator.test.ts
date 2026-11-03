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

  it('explains that an action outside the snapshot cannot be emulated', async () => {
    const emulator = await createConnectorEmulator(findConnector('.datadog'));

    const result = await emulator.runAction('muteMonitor', { monitorId: 1 });

    expect(result.status).toBe('error');
    const message = result.status === 'error' ? result.message : '';
    expect(message).toContain(".datadog.muteMonitor can't be emulated");
    expect(message).toContain("Monitor mute is not in Datadog's v1 spec");
    expect(message).not.toContain('status 404');
  });

  describe('with a response set by the caller', () => {
    const monitor = {
      id: 1,
      name: 'Checkout',
      overall_state: 'Alert',
      query: 'avg(last_5m):avg:system.cpu.user{*} > 90',
      type: 'metric alert',
    };

    it('runs the handler on a response that matches the vendor API, exactly as written', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      const result = await emulator.runAction('listMonitors', {}, { body: [monitor] });

      expect(result).toEqual(expect.objectContaining({ status: 'ok', data: [monitor] }));
    });

    it('fails a response that does not match the vendor API', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      const result = await emulator.runAction(
        'listMonitors',
        {},
        { body: [{ ...monitor, id: 'not-a-number', overall_state: 'NotAState' }] }
      );

      expect(result.status).toBe('error');
      const message = result.status === 'error' ? result.message : '';
      expect(message).toContain("doesn't match GET /api/v1/monitor");
      expect(message).toContain('/0/id');
      expect(message).toContain('/0/overall_state');
    });

    it('fails a response of the wrong shape', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      const result = await emulator.runAction('listMonitors', {}, { body: { monitors: [] } });

      expect(result.status === 'error' && result.message).toContain('Expected "array"');
    });

    it('lets the handler deal with an error status the spec does not list', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      const result = await emulator.runAction(
        'listMonitors',
        {},
        { status: 503, body: { errors: ['Unavailable'] } }
      );

      expect(result.status).toBe('error');
      const message = result.status === 'error' ? result.message : '';
      expect(message).toContain('503');
      expect(message).not.toContain("doesn't match");
    });

    it('still rejects a success status the spec does not list', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      const result = await emulator.runAction('listMonitors', {}, { status: 299, body: [monitor] });

      expect(result.status === 'error' && result.message).toContain('status 299');
    });

    it('explains that an action without operations has nothing to validate against', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      const result = await emulator.runAction('muteMonitor', { monitorId: 1 }, { body: {} });

      expect(result).toEqual(expect.objectContaining({ status: 'error', notEmulatable: true }));
    });

    it('rejects an operation the action does not call', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      const result = await emulator.runAction(
        'listMonitors',
        {},
        { operation: 'GET /nope', body: [] }
      );

      expect(result.status === 'error' && result.message).toContain("doesn't call GET /nope");
    });

    it('keeps sampling and paging when no response is set', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      const result = await emulator.runAction('listMonitors', {});

      expect(result.status === 'ok' && (result.data as unknown[]).length).toBeGreaterThan(1);
    });
  });

  describe('checkAction', () => {
    const monitor = { id: 1, overall_state: 'Alert', query: 'q', type: 'metric alert' };

    it('accepts an action the snapshot covers', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      await expect(emulator.checkAction('listMonitors')).resolves.toEqual({ status: 'ok' });
    });

    it('explains an action the snapshot does not cover', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      await expect(emulator.checkAction('muteMonitor')).resolves.toEqual({
        status: 'not-emulatable',
        message: expect.stringContaining("Monitor mute is not in Datadog's v1 spec"),
      });
    });

    it('accepts a matching response', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      await expect(emulator.checkAction('listMonitors', { body: [monitor] })).resolves.toEqual({
        status: 'ok',
      });
    });

    it('points at what is wrong with a response, as a run would report it', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      const check = await emulator.checkAction('listMonitors', {
        body: [{ ...monitor, id: 'not-a-number' }],
      });

      expect(check).toEqual({
        status: 'invalid',
        violations: [
          expect.objectContaining({
            path: ['body', '0', 'id'],
            message:
              'Response body at /0/id: Instance type "string" is invalid. Expected "integer".',
          }),
        ],
      });
    });

    it('flags a property the vendor schema does not declare', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      const check = await emulator.checkAction('listMonitors', {
        body: [{ ...monitor, namess222: 'Checkout errors' }],
      });

      expect(check).toEqual({
        status: 'invalid',
        violations: [
          {
            path: ['body', '0', 'namess222'],
            code: 'undeclared',
            message: expect.stringContaining('"namess222" isn\'t in the vendor\'s schema'),
          },
        ],
      });
    });

    it('runs with a warning about a property the vendor schema does not declare', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      const result = await emulator.runAction(
        'listMonitors',
        {},
        { body: [{ ...monitor, namess222: 'Checkout errors' }] }
      );

      expect(result).toEqual(
        expect.objectContaining({
          status: 'ok',
          warnings: [expect.stringContaining('"namess222"')],
        })
      );
    });

    it('allows an error status the spec does not list', async () => {
      const emulator = await createConnectorEmulator(findConnector('.datadog'));

      await expect(
        emulator.checkAction('listMonitors', { status: 503, body: { errors: ['Unavailable'] } })
      ).resolves.toEqual({ status: 'ok' });
    });

    it('does not run anything', async () => {
      const connector = findConnector('.datadog');
      const handler = jest.spyOn(connector.actions.listMonitors, 'handler');
      const emulator = await createConnectorEmulator(connector);

      await emulator.checkAction('listMonitors', { body: [monitor] });

      expect(handler).not.toHaveBeenCalled();
      handler.mockRestore();
    });
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
