/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Review verification for PR 299856. Each test asserts the behavior we'd expect;
// a failure confirms the corresponding review finding.

import { esManifest } from '@elastic/schemas/es/tools/manifest.js';
import { AgentExecutionMode } from '@kbn/agent-builder-common';
import type { ConfirmPromptDefinition } from '@kbn/agent-builder-common/agents/prompts';
import { AgentPromptType, ConfirmationStatus } from '@kbn/agent-builder-common/agents/prompts';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { executeWorkflow } from '@kbn/agent-builder-tools-base/workflows';
import { executeWorkflowTool } from './execute_workflow';
import { getStepRisk, resolveYamlAliases } from './utils/step_risk';
import {
  registerWorkflowExecuteStepTool,
  WORKFLOW_EXECUTE_STEP_TOOL_ID,
} from './workflow_execute_step_tool';

jest.mock('@kbn/agent-builder-tools-base/workflows', () => ({
  ...jest.requireActual('@kbn/agent-builder-tools-base/workflows'),
  executeWorkflow: jest.fn(),
}));
const executeWorkflowMock = executeWorkflow as jest.MockedFunction<typeof executeWorkflow>;

const RECURSIVE_ALIAS_YAML = `version: '1'
name: recursive
triggers:
  - type: manual
a: &x {b: *x}
steps:
  - name: log
    type: console
    with:
      message: hi
`;

const LAUGHS_YAML = `version: '1'
name: laughs
triggers:
  - type: manual
l0: &a [x, x, x, x, x, x, x, x, x, x]
l1: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]
l2: [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]
steps:
  - name: log
    type: console
    with:
      message: hi
`;

const STEP_YAML = `version: '1'
name: review
triggers:
  - type: manual
steps:
  - name: loop_mixed
    type: foreach
    foreach: "items"
    steps:
      - name: notify
        type: slack
        connector-id: my-slack
        with:
          message: hi
      - name: drop
        type: elasticsearch.indices.delete
        with:
          index: important
  - name: loop_big
    type: foreach
    foreach: "items"
    with:
      blob: "${'x'.repeat(3000)}"
    steps:
      - name: hidden_http
        type: http
        with:
          url: "https://example.com"
  - name: fenced
    type: slack
    connector-id: my-slack
    description: |
      ok
      \`\`\`
      INJECTED_MARKDOWN
    with:
      message: hi
`;

const createStepContext = (
  options: {
    yaml?: string;
    autoApprovedApis?: Array<{ target: 'elasticsearch' | 'kibana'; api: string }>;
  } = {}
) => ({
  spaceId: 'default',
  request: { headers: {} },
  executionMode: AgentExecutionMode.conversation,
  interactivity: { enabled: true, auto_approved_apis: options.autoApprovedApis },
  callContext: {
    toolId: WORKFLOW_EXECUTE_STEP_TOOL_ID,
    toolCallId: 'tc-1',
    callSource: 'agent' as const,
  },
  prompts: {
    checkConfirmationStatus: jest.fn().mockReturnValue({ status: ConfirmationStatus.unprompted }),
    askForConfirmation: jest.fn((def: ConfirmPromptDefinition) => ({
      prompt: { type: AgentPromptType.confirmation, ...def },
    })),
  },
  attachments: {
    getActive: jest
      .fn()
      .mockReturnValue(
        options.yaml
          ? [{ type: 'workflow.yaml', id: 'att-1', versions: [{ data: { yaml: options.yaml } }] }]
          : []
      ),
  },
});

const createWorkflowContext = (status = ConfirmationStatus.unprompted) =>
  ({
    request: { __mock: 'request' },
    spaceId: 'default',
    attachments: { get: jest.fn() },
    executionMode: AgentExecutionMode.conversation,
    interactivity: { enabled: true },
    callContext: { toolCallId: 'tc-1' },
    prompts: {
      checkConfirmationStatus: jest.fn().mockReturnValue({ status }),
      askForConfirmation: jest.fn((definition) => ({
        prompt: { type: 'confirmation', ...definition },
      })),
    },
  } as any);

const mockStepApi = {
  testStep: jest.fn().mockRejectedValue(new Error('not executed in this test')),
  getWorkflowExecution: jest.fn(),
  validateWorkflow: jest.fn().mockResolvedValue({ valid: true, diagnostics: [] }),
} as any;

const registerStepTool = (): BuiltinToolDefinition => {
  let tool: BuiltinToolDefinition | undefined;
  registerWorkflowExecuteStepTool(
    {
      tools: {
        register: (definition: BuiltinToolDefinition) => {
          tool = definition;
        },
      },
    } as any,
    mockStepApi,
    () => undefined
  );
  if (!tool) throw new Error('tool not registered');
  return tool;
};

const runStep = async (input: Record<string, unknown>, context: unknown): Promise<any> =>
  registerStepTool().handler(input as never, context as never);

describe('PR 299856 review verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    executeWorkflowMock.mockResolvedValue({ success: true, execution: {} } as any);
  });

  describe('finding 1: non-destructive ES writes', () => {
    it.each(['security.create_api_key', 'create', 'snapshot.create', 'security.create_service_token'])(
      'elasticsearch.%s needs confirmation',
      (api) => {
        const entry = esManifest.find(({ id }) => id === api) as
          | { destructive: boolean; readOnly: boolean }
          | undefined;
        // Record the manifest flags the classification is based on.
        expect({ api, destructive: entry?.destructive, readOnly: entry?.readOnly }).toEqual({
          api,
          destructive: false,
          readOnly: false,
        });
        expect(getStepRisk(`elasticsearch.${api}`).safe).toBe(false);
      }
    );
  });

  describe('finding 2: alias expansion failures', () => {
    it.each([
      ['recursive alias', RECURSIVE_ALIAS_YAML],
      ['excessive aliases', LAUGHS_YAML],
    ])('resolveYamlAliases does not throw on %s', (_label, yaml) => {
      expect(() => resolveYamlAliases(yaml)).not.toThrow();
    });

    it.each([
      ['recursive alias', RECURSIVE_ALIAS_YAML],
      ['excessive aliases', LAUGHS_YAML],
    ])('execute_step returns a result instead of throwing on %s', async (_label, yaml) => {
      await expect(runStep({ stepName: 'log', yaml }, createStepContext())).resolves.toBeDefined();
    });

    it.each([
      ['recursive alias', RECURSIVE_ALIAS_YAML],
      ['excessive aliases', LAUGHS_YAML],
    ])('execute_workflow returns a result instead of throwing on %s', async (_label, yaml) => {
      const tool = executeWorkflowTool({
        workflowsManagement: { management: {} } as any,
        getSecurity: () => undefined,
      });
      await expect(
        tool.handler({ yaml } as never, createWorkflowContext())
      ).resolves.toBeDefined();
    });
  });

  describe('finding 3: accepted prompt is not re-checked', () => {
    it('re-reads the persisted definition after acceptance', async () => {
      const getWorkflow = jest.fn().mockResolvedValue({ name: 'W', yaml: STEP_YAML });
      const tool = executeWorkflowTool({
        workflowsManagement: { management: { getWorkflow } } as any,
        getSecurity: () => undefined,
      });

      await tool.handler(
        { workflowId: 'wf-1' } as never,
        createWorkflowContext(ConfirmationStatus.accepted)
      );

      expect(executeWorkflowMock).toHaveBeenCalled();
      // Fails when the accepted path runs whatever the definition is now, unchecked.
      expect(getWorkflow).toHaveBeenCalled();
    });
  });

  describe('finding 4: execute-only caller can probe step risk', () => {
    it('responds the same way for safe and destructive workflows it cannot read', async () => {
      const executeOnlySecurity = () =>
        ({
          authz: {
            actions: { api: { get: (a: string) => `api:${a}` } },
            checkPrivilegesWithRequest: () => ({
              atSpace: async (_space: string, { kibana }: { kibana: string[] }) => ({
                hasAllRequested: kibana.includes('api:workflowsManagement:execute'),
              }),
            }),
          },
        } as any);
      const run = async (yaml: string) => {
        executeWorkflowMock.mockClear();
        const tool = executeWorkflowTool({
          workflowsManagement: {
            management: { getWorkflow: jest.fn().mockResolvedValue({ name: 'secret', yaml }) },
          } as any,
          getSecurity: executeOnlySecurity,
        });
        const result = (await tool.handler(
          { workflowId: 'wf-1' } as never,
          createWorkflowContext()
        )) as any;
        return { prompted: Boolean(result.prompt), color: result.prompt?.color };
      };

      const safe = await run(`version: '1'
name: safe
triggers:
  - type: manual
steps:
  - name: log
    type: console
    with:
      message: hi
`);
      const destructive = await run(STEP_YAML);

      expect(destructive).toEqual(safe);
    });
  });

  describe('finding 5: container color ignores later destructive children', () => {
    it('uses danger for a foreach whose second child deletes an index', async () => {
      const result = await runStep(
        { stepName: 'loop_mixed', confirmation_body: 'summary' },
        createStepContext({ yaml: STEP_YAML })
      );
      expect(result.prompt.color).toBe('danger');
    });
  });

  describe('finding 6: confirmation_body Markdown', () => {
    it('keeps a heading in confirmation_body at the start of a line', async () => {
      const result = await runStep(
        { stepName: 'fenced', confirmation_body: '## Inputs\n- channel: #ops' },
        createStepContext({ yaml: STEP_YAML })
      );
      expect(result.prompt.message).toMatch(/^## Inputs$/m);
    });
  });

  describe('finding 7: step YAML preview', () => {
    it('shows the unsafe child of a container with a large payload', async () => {
      const result = await runStep(
        { stepName: 'loop_big', confirmation_body: 'summary' },
        createStepContext({ yaml: STEP_YAML })
      );
      expect(result.prompt.message).toContain('hidden_http');
    });

    it('keeps step values inside the yaml code fence', async () => {
      const result = await runStep(
        { stepName: 'fenced', confirmation_body: 'summary' },
        createStepContext({ yaml: STEP_YAML })
      );
      const lines: string[] = result.prompt.message.split('\n');
      const open = lines.indexOf('```yaml');
      // CommonMark closes a fence on a line of up to 3 spaces of indent and ```.
      const close = lines.findIndex((line, index) => index > open && /^ {0,3}```\s*$/.test(line));
      const injected = lines.findIndex((line) => line.includes('INJECTED_MARKDOWN'));
      expect(injected).toBeLessThan(close);
    });
  });

  describe('finding 8: execute_step ignores run-level auto-approval', () => {
    it('skips the dialog when workflows.* is auto-approved', async () => {
      const context = createStepContext({
        yaml: STEP_YAML,
        autoApprovedApis: [{ target: 'kibana', api: 'workflows.*' }],
      });
      await runStep({ stepName: 'fenced' }, context);
      expect(context.prompts.askForConfirmation).not.toHaveBeenCalled();
    });
  });
});
