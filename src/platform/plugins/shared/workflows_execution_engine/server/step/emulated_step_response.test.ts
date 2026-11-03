/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ConnectorStepImpl } from './connector_step';
import type { ConnectorExecutor } from '../connector_executor';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionRuntimeManager } from '../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../workflow_event_logger';

describe('step responses set by the workflow', () => {
  const setup = ({
    emulate,
    type = 'datadog.muteMonitor',
    withInputs = { monitorId: 1 },
    workflowExecution = { isTestRun: true, emulateConnectors: true },
  }: {
    emulate?: Record<string, unknown>;
    type?: string;
    withInputs?: Record<string, unknown>;
    workflowExecution?: Record<string, unknown>;
  }) => {
    const runtime = {
      abortController: new AbortController(),
      startStep: jest.fn(),
      setInput: jest.fn(),
      finishStep: jest.fn(),
      failStep: jest.fn(),
      stepExecutionId: 'step-1',
      stepLogger: { logInfo: jest.fn() },
      workflowExecution,
      node: { configuration: { emulate } },
      contextManager: {
        renderObjectAccordingToContextAsync: jest.fn(async (value) => value),
        renderValueAccordingToContext: jest.fn((value) => value),
        getDependencies: () => ({ config: {} }),
      },
    };
    const connectorExecutor = {
      isEmulating: Boolean(workflowExecution.emulateConnectors),
      execute: jest.fn().mockResolvedValue({ status: 'ok', data: 'from the connector' }),
      executeSystemConnector: jest.fn(),
    };
    const workflowRuntime = { navigateToNextNode: jest.fn() };
    const step = new ConnectorStepImpl(
      { stepId: 'mute', name: 'mute', type, 'connector-id': 'x', with: withInputs },
      runtime as unknown as StepExecutionRuntime,
      connectorExecutor as unknown as ConnectorExecutor,
      workflowRuntime as unknown as WorkflowExecutionRuntimeManager,
      { logInfo: jest.fn() } as unknown as IWorkflowEventLogger
    );
    return { step, runtime, connectorExecutor, workflowRuntime };
  };

  it('returns the set output without running the connector', async () => {
    const { step, runtime, connectorExecutor, workflowRuntime } = setup({
      emulate: { output: { muted: true } },
    });

    await step.run();

    expect(connectorExecutor.execute).not.toHaveBeenCalled();
    expect(runtime.finishStep).toHaveBeenCalledWith({ muted: true }, expect.any(Number));
    expect(workflowRuntime.navigateToNextNode).toHaveBeenCalled();
  });

  it('fails with the set error', async () => {
    const { step, runtime, connectorExecutor } = setup({
      emulate: { error: 'Rate limited', output: { ignored: true } },
    });

    await step.run();

    expect(connectorExecutor.execute).not.toHaveBeenCalled();
    expect(runtime.failStep.mock.calls[0][0].message).toBe('Rate limited');
    expect(runtime.finishStep).not.toHaveBeenCalled();
  });

  it('still rejects input the action does not accept', async () => {
    const { step, runtime } = setup({
      emulate: { output: {} },
      withInputs: { monitorId: 'not-a-number' },
    });

    await step.run();

    expect(runtime.failStep.mock.calls[0][0].message).toContain(
      'Invalid input for datadog.muteMonitor'
    );
  });

  it('rejects an action the connector does not have', async () => {
    const { step, runtime } = setup({ emulate: { output: {} }, type: 'datadog.noSuchAction' });

    await step.run();

    expect(runtime.failStep.mock.calls[0][0].message).toContain('has no action noSuchAction');
  });

  it('allows a set output of null', async () => {
    const { step, runtime } = setup({ emulate: { output: null } });

    await step.run();

    expect(runtime.finishStep).toHaveBeenCalledWith(null, undefined);
  });

  it.each([
    ['a production run', { isTestRun: false, emulateConnectors: false }],
    ['a test run without emulation', { isTestRun: true, emulateConnectors: false }],
    ['a production run claiming emulation', { isTestRun: false, emulateConnectors: true }],
  ])('runs the real step in %s', async (_label, workflowExecution) => {
    const { step, connectorExecutor, runtime } = setup({
      emulate: { output: { muted: true } },
      workflowExecution,
    });

    await step.run();

    expect(connectorExecutor.execute).toHaveBeenCalled();
    expect(runtime.finishStep).toHaveBeenCalledWith('from the connector', expect.any(Number));
  });

  it('falls back to the emulator when the block sets nothing', async () => {
    const { step, connectorExecutor } = setup({ emulate: {} });

    await step.run();

    expect(connectorExecutor.execute).toHaveBeenCalled();
  });
});
