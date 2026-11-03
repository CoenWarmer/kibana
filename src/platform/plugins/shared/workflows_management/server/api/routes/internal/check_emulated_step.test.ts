/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import { registerCheckEmulatedStepRoute } from './check_emulated_step';
import type { RouteDependencies } from '../types';

jest.mock('../utils/with_availability_check', () => ({
  withAvailabilityCheck: (handler: unknown) => handler,
}));

type Handler = (
  context: unknown,
  request: unknown,
  response: ReturnType<typeof httpServerMock.createResponseFactory>
) => Promise<unknown>;

describe('POST /internal/workflows/emulation/check', () => {
  let handler: Handler;
  let routeConfig: { options?: { body?: { maxBytes?: number } } };

  beforeEach(() => {
    const router = {
      versioned: {
        post: jest.fn((config) => {
          routeConfig = config;
          return {
            addVersion: (_version: unknown, routeHandler: Handler) => {
              handler = routeHandler;
            },
          };
        }),
      },
    };
    registerCheckEmulatedStepRoute({
      router,
      logger: { debug: jest.fn() },
    } as unknown as RouteDependencies);
  });

  const check = async (body: unknown) => {
    const response = httpServerMock.createResponseFactory();
    await handler({}, { body }, response);
    return response.ok.mock.calls[0][0]?.body;
  };

  it('limits the request size', () => {
    expect(routeConfig.options?.body?.maxBytes).toBeGreaterThan(0);
  });

  it('accepts a step the snapshot covers', async () => {
    await expect(check({ stepType: 'datadog.listMonitors' })).resolves.toEqual({ status: 'ok' });
  });

  it('reports what is wrong with a response', async () => {
    await expect(
      check({ stepType: 'datadog.listMonitors', response: { body: {} } })
    ).resolves.toEqual({
      status: 'invalid',
      violations: [expect.objectContaining({ path: ['body'] })],
    });
  });

  it('points at emulate.output for a step outside the snapshot', async () => {
    const answer = await check({ stepType: 'datadog.muteMonitor' });

    expect(answer).toEqual({
      status: 'not-emulatable',
      message: expect.stringContaining('Set emulate.output'),
    });
  });

  it.each([
    ['an unrecorded connector', 'gcp_cloud_functions.listFunctions'],
    ['a step without a connector spec', 'elasticsearch.search'],
    ['a step without an action', 'datadog'],
  ])('points at emulate.output for %s', async (_label, stepType) => {
    const answer = await check({ stepType });

    expect(answer).toEqual({
      status: 'not-emulatable',
      message: expect.stringContaining('Set emulate.output'),
    });
  });
});
