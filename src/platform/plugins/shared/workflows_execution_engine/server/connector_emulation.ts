/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionTypeExecutorResult } from '@kbn/actions-plugin/common';
import { getConnectorSpec } from '@kbn/connector-specs';
import type { ConnectorEmulator } from '@kbn/connector-specs/server';
import { createConnectorEmulator } from '@kbn/connector-specs/server';
import type { IWorkflowEventLogger } from './workflow_event_logger';

const LOG_TAGS = ['connector-emulation'];

/** Answers a test run's connector steps from vendor API snapshots, never from the real vendor. */
export class ConnectorEmulation {
  // The lifespan of this cache is one workflow execution, like the connector executor's.
  private readonly emulators = new Map<string, Promise<ConnectorEmulator>>();

  constructor(private readonly workflowLogger: IWorkflowEventLogger) {}

  public async run({
    connectorType,
    input,
  }: {
    connectorType: string;
    input: Record<string, unknown>;
  }): Promise<ActionTypeExecutorResult<unknown>> {
    const typeId = connectorType.startsWith('.') ? connectorType : `.${connectorType}`;
    const actionId = `emulated-${typeId}`;
    const fail = (message: string): ActionTypeExecutorResult<unknown> => ({
      status: 'error',
      actionId,
      message,
    });

    const { subAction, subActionParams } = input;
    if (!getConnectorSpec(typeId) || typeof subAction !== 'string') {
      return fail(`${typeId} steps can't be emulated, and emulated runs don't call real vendors`);
    }

    try {
      const emulator = await this.getEmulator(typeId);
      const result = await emulator.runAction(subAction, subActionParams ?? {});
      for (const { request, status, requestViolations, responseViolations } of result.calls) {
        const line = `Emulated ${typeId}.${subAction}: ${status} ${request}`;
        const violations = [...requestViolations, ...responseViolations];
        if (violations.length > 0) {
          this.workflowLogger.logWarn(
            [line, ...violations.map(({ message }) => `  - ${message}`)].join('\n'),
            { tags: LOG_TAGS }
          );
        } else {
          this.workflowLogger.logInfo(line, { tags: LOG_TAGS });
        }
      }
      return result.status === 'ok'
        ? { status: 'ok', actionId, data: result.data }
        : fail(result.message);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }

  private getEmulator(typeId: string): Promise<ConnectorEmulator> {
    const existing = this.emulators.get(typeId);
    if (existing) {
      return existing;
    }
    const connector = getConnectorSpec(typeId);
    if (!connector) {
      return Promise.reject(new Error(`${typeId} has no connector spec`));
    }
    const created = createConnectorEmulator(connector);
    this.emulators.set(typeId, created);
    return created;
  }
}
