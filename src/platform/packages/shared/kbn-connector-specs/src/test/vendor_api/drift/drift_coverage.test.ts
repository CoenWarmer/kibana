/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DriftReportEntry, SourceDrift } from './detect_drift';
import { renderDriftCoverage, summarizeDriftCoverage } from './drift_coverage';

const source = (status: SourceDrift['status']): SourceDrift => ({ status });

/** A checked connector with `tracked` actions that match an operation and `untracked` that don't. */
const checked = (
  connector: string,
  {
    tracked = 0,
    untracked = 0,
    sources = { v1: source('unchanged') },
  }: {
    tracked?: number;
    untracked?: number;
    sources?: Record<string, SourceDrift>;
  } = {}
): DriftReportEntry =>
  ({
    connector,
    sources,
    actions: [
      ...Array.from({ length: tracked }, (unused, index) => ({
        action: `tracked${index}`,
        operations: [{ source: 'v1', operation: 'GET /items' }],
        unmatched: [],
      })),
      ...Array.from({ length: untracked }, (unused, index) => ({
        action: `untracked${index}`,
        operations: [],
        unmatched: [{ operation: 'GET /mcp', reason: 'The vendor MCP server' }],
      })),
    ],
  } as unknown as DriftReportEntry);

const summarize = (report: readonly DriftReportEntry[], connectors: string[], exempt: string[]) =>
  summarizeDriftCoverage({
    report,
    connectors,
    recorded: new Set(report.map(({ connector }) => connector)),
    exempt: new Set(exempt),
  });

describe('summarizeDriftCoverage', () => {
  it('splits the repo into recorded, exempt and unrecorded', () => {
    const { totals } = summarize(
      [checked('.figma', { tracked: 2 })],
      ['.figma', '.mysql', '.threatq'],
      ['.mysql']
    );

    expect(totals).toMatchObject({
      connectors: 3,
      recorded: 1,
      exempt: 1,
      unrecorded: 1,
      checked: 1,
    });
  });

  it('counts an action as tracked only when a spec describes one of its operations', () => {
    const { totals, connectors } = summarize(
      [checked('.pagerduty', { tracked: 6, untracked: 21 })],
      ['.pagerduty'],
      []
    );

    expect(totals).toMatchObject({ actions: 27, trackedActions: 6 });
    expect(connectors).toEqual([
      expect.objectContaining({
        connector: '.pagerduty',
        actions: 27,
        trackedActions: 6,
        untrackedActions: 21,
      }),
    ]);
  });

  it('does not count a connector whose every source is pinned as able to detect a change', () => {
    const { totals, connectors } = summarize(
      [
        checked('.box', { tracked: 3, sources: { tools: source('pinned') } }),
        checked('.github', {
          tracked: 4,
          sources: { rest: source('changed'), mcp: source('pinned') },
        }),
      ],
      ['.box', '.github'],
      []
    );

    expect(totals).toMatchObject({ checked: 2, canDetectChange: 1, sources: 3, pinnedSources: 2 });
    expect(
      connectors.map(({ connector, canDetectChange }) => [connector, canDetectChange])
    ).toEqual(
      expect.arrayContaining([
        ['.box', false],
        ['.github', true],
      ])
    );
  });

  it('leaves a connector the check could not run out of the counts', () => {
    const { totals, connectors } = summarize(
      [checked('.figma', { tracked: 2 }), { connector: '.jira', error: 'rate limited' }],
      ['.figma', '.jira'],
      []
    );

    expect(totals).toMatchObject({ checked: 1, failed: 1, actions: 2 });
    expect(connectors).toHaveLength(1);
  });

  it('orders the connectors by how many of their actions no spec describes', () => {
    const { connectors } = summarize(
      [
        checked('.a', { tracked: 5 }),
        checked('.b', { tracked: 1, untracked: 9 }),
        checked('.c', { tracked: 1, untracked: 2 }),
      ],
      ['.a', '.b', '.c'],
      []
    );

    expect(connectors.map(({ connector }) => connector)).toEqual(['.b', '.c', '.a']);
  });
});

describe('renderDriftCoverage', () => {
  it('reports the totals and only the connectors with untracked actions', () => {
    const lines = renderDriftCoverage(
      summarize(
        [checked('.a', { tracked: 5 }), checked('.b', { tracked: 1, untracked: 2 })],
        ['.a', '.b', '.mysql'],
        ['.mysql']
      )
    );

    expect(lines[0]).toBe('2 of 3 connectors recorded (1 exempt, 0 neither)');
    expect(lines[1]).toBe('2 of 2 checked can detect a vendor change (0 of 2 sources pinned)');
    expect(lines[2]).toBe('6 of 8 actions call an operation a spec describes');
    expect(lines).toContain('- `.b`: 1 of 3 tracked');
    expect(lines.join('\n')).not.toContain('`.a`');
  });

  it('says when a connector could not be checked', () => {
    const lines = renderDriftCoverage(
      summarize([{ connector: '.jira', error: 'rate limited' }], ['.jira'], [])
    );

    expect(lines).toContain('1 connector(s) could not be checked');
  });
});
