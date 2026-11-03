/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionsClient } from '@kbn/actions-plugin/server';
import { ConnectorEmulation } from './connector_emulation';
import { ConnectorExecutor } from './connector_executor';
import type { IWorkflowEventLogger } from './workflow_event_logger';

describe('connector emulation', () => {
  const actionsClient = {
    execute: jest.fn(),
    get: jest.fn(),
    getAll: jest.fn(),
  };
  const workflowLogger = {
    logInfo: jest.fn(),
    logWarn: jest.fn(),
  };

  const createExecutor = () =>
    new ConnectorExecutor(
      actionsClient as unknown as ActionsClient,
      new ConnectorEmulation(workflowLogger as unknown as IWorkflowEventLogger)
    );

  afterEach(() => {
    expect(actionsClient.execute).not.toHaveBeenCalled();
    expect(actionsClient.get).not.toHaveBeenCalled();
    expect(actionsClient.getAll).not.toHaveBeenCalled();
    jest.clearAllMocks();
  });

  it('answers a recorded connector without a connector instance or the actions client', async () => {
    const result = await createExecutor().execute({
      connectorType: 'datadog',
      connectorNameOrId: '',
      input: { subAction: 'listMonitors', subActionParams: {} },
      abortController: new AbortController(),
    });

    expect(result.status).toBe('ok');
    expect(workflowLogger.logInfo).toHaveBeenCalledWith(
      expect.stringContaining('Emulated .datadog.listMonitors: 200 GET'),
      expect.anything()
    );
  });

  it('fails connectors without a recorded vendor API instead of calling the vendor', async () => {
    const result = await createExecutor().execute({
      connectorType: 'gcp_cloud_functions',
      connectorNameOrId: 'a-real-connector',
      input: { subAction: 'listFunctions', subActionParams: {} },
      abortController: new AbortController(),
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'error',
        message: expect.stringContaining('no recorded vendor API'),
      })
    );
  });

  it('fails connector types without a spec', async () => {
    const result = await createExecutor().execute({
      connectorType: 'slack_api',
      connectorNameOrId: 'a-real-connector',
      input: { subAction: 'postMessage', subActionParams: {} },
      abortController: new AbortController(),
    });

    expect(result.status).toBe('error');
  });

  it('fails system connectors instead of running them', async () => {
    const result = await createExecutor().executeSystemConnector({
      connectorType: '.http',
      input: { url: 'https://example.com' },
      abortController: new AbortController(),
    });

    expect(result.status).toBe('error');
  });

  it('reports the executor as emulating only with an emulation', () => {
    expect(createExecutor().isEmulating).toBe(true);
    expect(new ConnectorExecutor(actionsClient as unknown as ActionsClient).isEmulating).toBe(
      false
    );
  });
});
