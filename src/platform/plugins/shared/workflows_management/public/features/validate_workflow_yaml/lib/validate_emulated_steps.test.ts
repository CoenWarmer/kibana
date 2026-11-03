/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LineCounter, parseDocument } from 'yaml';
import type { CheckEmulatedStep, EmulatedStepCheck } from './validate_emulated_steps';
import { createCachedEmulatedStepCheck, validateEmulatedSteps } from './validate_emulated_steps';

const parse = (yaml: string) => {
  const lineCounter = new LineCounter();
  return { document: parseDocument(yaml, { lineCounter }), lineCounter };
};

const validate = (yaml: string, answer: EmulatedStepCheck) => {
  const { document, lineCounter } = parse(yaml);
  const check = jest.fn<ReturnType<CheckEmulatedStep>, Parameters<CheckEmulatedStep>>(
    async () => answer
  );
  return validateEmulatedSteps(document, lineCounter, check).then((validation) => ({
    ...validation,
    check,
  }));
};

const STEP_WITH_RESPONSE = `name: test
steps:
  - name: list
    type: datadog.listMonitors
    connector-id: x
    emulate:
      response:
        status: 200
        body:
          - id: not-a-number
            overall_state: "\${{ steps.a.output }}"
`;

describe('validateEmulatedSteps', () => {
  it('sends the step type and its response', async () => {
    const { check } = await validate(STEP_WITH_RESPONSE, { status: 'ok' });

    expect(check).toHaveBeenCalledWith({
      stepType: 'datadog.listMonitors',
      response: {
        status: 200,
        body: [{ id: 'not-a-number', overall_state: '${{ steps.a.output }}' }],
      },
    });
  });

  it('puts a violation on the value it concerns', async () => {
    const { results } = await validate(STEP_WITH_RESPONSE, {
      status: 'invalid',
      violations: [{ path: ['body', '0', 'id'], message: 'Expected "integer".' }],
    });

    expect(results).toEqual([
      expect.objectContaining({
        owner: 'emulated-response-validation',
        ruleId: 'invalidEmulatedResponse',
        severity: 'error',
        message: 'Expected "integer".',
        startLineNumber: 10,
      }),
    ]);
  });

  it('puts a missing property on the closest value that exists', async () => {
    const { results } = await validate(STEP_WITH_RESPONSE, {
      status: 'invalid',
      violations: [{ path: ['body', '0', 'query'], message: 'Missing query.' }],
    });

    expect(results[0].startLineNumber).toBe(10);
  });

  it('skips violations on templates, which only have a type at run time', async () => {
    const { results } = await validate(STEP_WITH_RESPONSE, {
      status: 'invalid',
      violations: [{ path: ['body', '0', 'overall_state'], message: 'Not a state.' }],
    });

    expect(results).toEqual([]);
  });

  it('skips violations below a template', async () => {
    const { results } = await validate(
      `steps:
  - name: list
    type: datadog.listMonitors
    emulate:
      response:
        body: "\${{ steps.a.output }}"
`,
      {
        status: 'invalid',
        violations: [{ path: ['body'], message: 'Expected "array".' }],
      }
    );

    expect(results).toEqual([]);
  });

  it('warns about a step nothing can answer, and reports its connector line', async () => {
    const { results, notEmulatableConnectorLines } = await validate(
      `steps:
  - name: mute
    type: datadog.muteMonitor
    connector-id: x
`,
      { status: 'not-emulatable', message: "Can't be emulated." }
    );

    expect(results).toEqual([
      expect.objectContaining({
        ruleId: 'stepNotEmulatable',
        severity: 'warning',
        startLineNumber: 3,
      }),
    ]);
    expect([...notEmulatableConnectorLines]).toEqual([4]);
  });

  it('fails a response on a step with no contract to check it against', async () => {
    const { results } = await validate(STEP_WITH_RESPONSE, {
      status: 'not-emulatable',
      message: 'No contract.',
    });

    expect(results).toEqual([
      expect.objectContaining({
        ruleId: 'invalidEmulatedResponse',
        severity: 'error',
        startLineNumber: 7,
      }),
    ]);
  });

  it.each([
    ['output', 'output: {}'],
    ['error', 'error: failed'],
  ])('does not check a step that sets its %s', async (_label, line) => {
    const { check } = await validate(
      `steps:
  - name: mute
    type: datadog.muteMonitor
    connector-id: x
    emulate:
      ${line}
`,
      { status: 'not-emulatable', message: 'No.' }
    );

    expect(check).not.toHaveBeenCalled();
  });

  it('finds nested steps but not triggers', async () => {
    const { check } = await validate(
      `triggers:
  - name: event
    type: some.trigger
    connector-id: x
steps:
  - name: each
    type: foreach
    steps:
      - name: inner
        type: datadog.getMonitor
        connector-id: x
`,
      { status: 'ok' }
    );

    expect(check.mock.calls.map(([{ stepType }]) => stepType)).toEqual(['datadog.getMonitor']);
  });

  it('leaves the editor alone when the server can not answer', async () => {
    const { document, lineCounter } = parse(STEP_WITH_RESPONSE);

    const { results } = await validateEmulatedSteps(document, lineCounter, async () => {
      throw new Error('Offline');
    });

    expect(results).toEqual([]);
  });
});

describe('createCachedEmulatedStepCheck', () => {
  it('asks once per request', async () => {
    const check = jest.fn(async () => ({ status: 'ok' } as const));
    const cached = createCachedEmulatedStepCheck(check);

    await cached({ stepType: 'a.b' });
    await cached({ stepType: 'a.b' });
    await cached({ stepType: 'a.c' });

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('asks again after a failure', async () => {
    const check = jest
      .fn<ReturnType<CheckEmulatedStep>, Parameters<CheckEmulatedStep>>()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue({ status: 'ok' });
    const cached = createCachedEmulatedStepCheck(check);

    await expect(cached({ stepType: 'a.b' })).rejects.toThrow('Offline');

    await expect(cached({ stepType: 'a.b' })).resolves.toEqual({ status: 'ok' });
  });
});
