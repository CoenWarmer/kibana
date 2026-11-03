/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document, LineCounter, Node, Pair, YAMLMap } from 'yaml';
import { isMap, isPair, isScalar, isSeq, visit } from 'yaml';
import type { YamlValidationDiagnostic } from '@kbn/workflows-yaml';
import { getPathFromAncestors } from '../../../../common/lib/yaml';

export interface EmulatedStepCheckRequest {
  readonly stepType: string;
  readonly response?: Record<string, unknown>;
}

export type EmulatedStepCheck =
  | { readonly status: 'ok' }
  | { readonly status: 'not-emulatable'; readonly message: string }
  | {
      readonly status: 'invalid';
      readonly violations: ReadonlyArray<{
        readonly path: readonly string[];
        readonly message: string;
      }>;
    };

export type CheckEmulatedStep = (request: EmulatedStepCheckRequest) => Promise<EmulatedStepCheck>;

const MAX_CACHED_CHECKS = 500;

/** Remembers answers, as validation runs on every edit but a step's block rarely changes. */
export const createCachedEmulatedStepCheck = (check: CheckEmulatedStep): CheckEmulatedStep => {
  const cache = new Map<string, Promise<EmulatedStepCheck>>();
  return (request) => {
    const key = JSON.stringify(request);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    if (cache.size >= MAX_CACHED_CHECKS) {
      cache.clear();
    }
    const answer = check(request).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, answer);
    return answer;
  };
};

const findPair = (map: YAMLMap, key: string): Pair<Node, Node | null> | undefined =>
  map.items.find((item) => isPair(item) && isScalar(item.key) && item.key.value === key) as
    | Pair<Node, Node | null>
    | undefined;

interface LocatedNode {
  /** The value at the path, or the deepest part of it that exists. */
  readonly node: Node;
  /** A template only has its final type at run time, so it can't be judged now. */
  readonly isTemplate: boolean;
}

const locate = (start: Node, path: readonly string[]): LocatedNode => {
  let node = start;
  for (const segment of path) {
    if (isScalar(node) && typeof node.value === 'string' && node.value.includes('{{')) {
      return { node, isTemplate: true };
    }
    const next = isMap(node)
      ? findPair(node, segment)?.value
      : isSeq(node)
      ? (node.items[Number(segment)] as Node | undefined)
      : undefined;
    if (!next) {
      return { node, isTemplate: false };
    }
    node = next;
  }
  return {
    node,
    isTemplate: isScalar(node) && typeof node.value === 'string' && node.value.includes('{{'),
  };
};

const toResult = (
  node: Node,
  lineCounter: LineCounter,
  ruleId: 'invalidEmulatedResponse' | 'stepNotEmulatable',
  message: string
): YamlValidationDiagnostic | undefined => {
  if (!node.range) {
    return undefined;
  }
  const [startOffset, valueEnd] = node.range;
  const start = lineCounter.linePos(startOffset);
  const end = lineCounter.linePos(valueEnd);
  return {
    id: `${ruleId}-${start.line}-${start.col}-${message}`,
    owner: 'emulated-response-validation',
    ruleId,
    severity: ruleId === 'stepNotEmulatable' ? 'warning' : 'error',
    message,
    startLineNumber: start.line,
    startColumn: start.col,
    endLineNumber: end.line,
    endColumn: end.col,
    hoverMessage: null,
  };
};

interface EmulatedStepNode {
  readonly stepType: string;
  readonly typeNode: Node;
  readonly connectorIdNode?: Node;
  /** The `response` key and value in the step's \`emulate\` block. */
  readonly responsePair?: Pair<Node, Node | null>;
}

const collectEmulatedSteps = (document: Document): EmulatedStepNode[] => {
  const steps: EmulatedStepNode[] = [];
  visit(document, {
    Map(_key, node, ancestors) {
      const typePair = findPair(node, 'type');
      if (!typePair || !isScalar(typePair.value) || typeof typePair.value.value !== 'string') {
        return;
      }
      if (!findPair(node, 'name') || getPathFromAncestors(ancestors)[0] !== 'steps') {
        return;
      }
      const emulate = findPair(node, 'emulate')?.value;
      const emulateMap = isMap(emulate) ? emulate : undefined;
      // A set output or error replaces the step, so there is nothing to check.
      if (emulateMap && (findPair(emulateMap, 'output') || findPair(emulateMap, 'error'))) {
        return;
      }
      const connectorIdPair = findPair(node, 'connector-id');
      const responsePair = emulateMap ? findPair(emulateMap, 'response') : undefined;
      if (!connectorIdPair && !responsePair) {
        return;
      }
      steps.push({
        stepType: typePair.value.value,
        typeNode: typePair.value,
        connectorIdNode: connectorIdPair?.value ?? undefined,
        responsePair,
      });
    },
  });
  return steps;
};

export interface EmulatedStepsValidation {
  readonly results: YamlValidationDiagnostic[];
  /** The `connector-id` lines of steps that an emulated run can't answer. */
  readonly notEmulatableConnectorLines: ReadonlySet<number>;
}

/** Validates steps for an emulated test run, including their \`emulate.response\` blocks. */
export const validateEmulatedSteps = async (
  document: Document,
  lineCounter: LineCounter,
  check: CheckEmulatedStep
): Promise<EmulatedStepsValidation> => {
  const results: YamlValidationDiagnostic[] = [];
  const notEmulatableConnectorLines = new Set<number>();

  await Promise.all(
    collectEmulatedSteps(document).map(
      async ({ stepType, typeNode, connectorIdNode, responsePair }) => {
        const responseNode = responsePair?.value ?? undefined;
        const response = isMap(responseNode)
          ? (responseNode.toJS(document) as Record<string, unknown>)
          : undefined;
        let answer: EmulatedStepCheck;
        try {
          answer = await check({ stepType, ...(response ? { response } : {}) });
        } catch {
          // Running the step still validates it, so an unreachable server shouldn't flag the editor.
          return;
        }

        const push = (result: YamlValidationDiagnostic | undefined) => {
          if (result) {
            results.push(result);
          }
        };
        if (answer.status === 'not-emulatable') {
          if (connectorIdNode?.range) {
            notEmulatableConnectorLines.add(lineCounter.linePos(connectorIdNode.range[0]).line);
          }
          push(
            responsePair
              ? toResult(responsePair.key, lineCounter, 'invalidEmulatedResponse', answer.message)
              : toResult(typeNode, lineCounter, 'stepNotEmulatable', answer.message)
          );
          return;
        }
        if (answer.status === 'invalid' && responsePair && responseNode) {
          for (const { path, message } of answer.violations) {
            const { node, isTemplate } = locate(responseNode, path);
            if (!isTemplate) {
              const target = path.length > 0 ? node : responsePair.key;
              push(toResult(target, lineCounter, 'invalidEmulatedResponse', message));
            }
          }
        }
      }
    )
  );

  return { results, notEmulatableConnectorLines };
};
