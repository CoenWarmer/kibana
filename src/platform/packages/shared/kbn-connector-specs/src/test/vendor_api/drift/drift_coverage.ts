/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConnectorDrift, DriftReportEntry, FailedDrift } from './detect_drift';

const isFailed = (entry: DriftReportEntry): entry is FailedDrift => 'error' in entry;

/**
 * How much of the repo the drift check covers.
 *
 * `connectors`, `recorded`, `exempt` and `unrecorded` describe the repository. Everything else
 * describes the run: a run for a single connector (`--connector`) reports one checked connector
 * against the same repository totals, so the two must not be read as one ratio.
 */
export interface DriftCoverageTotals {
  /** Every connector in the repo, recorded or not. */
  readonly connectors: number;
  /** Connectors with `vendor_api` artifacts, so the check can look at them. */
  readonly recorded: number;
  readonly exempt: number;
  /** Neither recorded nor exempt: nothing states why the check skips them. */
  readonly unrecorded: number;
  /**
   * Recorded connectors this run checked, which is all of them unless `--connector` was given.
   * Excludes the ones it could not check: those have no sources or actions to count.
   */
  readonly checked: number;
  /** Connectors the check could not run, so nothing below counts them. */
  readonly failed: number;
  /**
   * Checked connectors with at least one source that still follows the vendor. A connector whose
   * every source is captured is checked against its own snapshot, so no vendor change can reach
   * it until someone captures it again.
   */
  readonly canDetectChange: number;
  readonly sources: number;
  /** Captured sources, which the check reports as `pinned` rather than comparing them. */
  readonly pinnedSources: number;
  /** Actions of the checked connectors. */
  readonly actions: number;
  /**
   * Actions calling at least one operation a vendor spec describes. The rest only make requests
   * the manifest records as `unmatched`, so a vendor change to them is invisible.
   */
  readonly trackedActions: number;
}

export interface ConnectorCoverageRow {
  readonly connector: string;
  readonly actions: number;
  readonly trackedActions: number;
  /** Actions whose every request is unmatched. */
  readonly untrackedActions: number;
  readonly sources: number;
  readonly pinnedSources: number;
  readonly canDetectChange: boolean;
}

export interface DriftCoverage {
  readonly totals: DriftCoverageTotals;
  /** One row per checked connector, least tracked first, then by name. */
  readonly connectors: readonly ConnectorCoverageRow[];
  /**
   * The same thing as text, so the build annotation and the CLI log say it the same way and the
   * pipeline doesn't format the numbers a second time in `jq`.
   */
  readonly lines: readonly string[];
}

const rowOf = (entry: ConnectorDrift): ConnectorCoverageRow => {
  const actions = entry.actions ?? [];
  const sources = Object.values(entry.sources ?? {});
  const pinnedSources = sources.filter(({ status }) => status === 'pinned').length;
  const trackedActions = actions.filter(({ operations }) => operations.length > 0).length;
  return {
    connector: entry.connector,
    actions: actions.length,
    trackedActions,
    untrackedActions: actions.length - trackedActions,
    sources: sources.length,
    pinnedSources,
    // A connector with no source at all cannot see a change either.
    canDetectChange: sources.length > pinnedSources,
  };
};

/**
 * Summarizes what the drift check covers, from the report it just produced and the repository's
 * own connector list. Pure, so the pipeline and the tests read the same numbers.
 */
export const summarizeDriftCoverage = ({
  report,
  connectors,
  recorded,
  exempt,
}: {
  readonly report: readonly DriftReportEntry[];
  /** Every connector in the repo, by `metadata.id`. */
  readonly connectors: readonly string[];
  /** The connectors with `vendor_api` artifacts. */
  readonly recorded: ReadonlySet<string>;
  /** The connectors on the exemption list. */
  readonly exempt: ReadonlySet<string>;
}): DriftCoverage => {
  const rows = report
    .filter((entry): entry is ConnectorDrift => !isFailed(entry))
    .map(rowOf)
    .sort(
      (a, b) => b.untrackedActions - a.untrackedActions || a.connector.localeCompare(b.connector)
    );
  const sum = (pick: (row: ConnectorCoverageRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const recordedCount = connectors.filter((id) => recorded.has(id)).length;
  const exemptCount = connectors.filter((id) => !recorded.has(id) && exempt.has(id)).length;
  const totals: DriftCoverageTotals = {
    connectors: connectors.length,
    recorded: recordedCount,
    exempt: exemptCount,
    unrecorded: connectors.length - recordedCount - exemptCount,
    checked: rows.length,
    failed: report.length - rows.length,
    canDetectChange: rows.filter(({ canDetectChange }) => canDetectChange).length,
    sources: sum(({ sources }) => sources),
    pinnedSources: sum(({ pinnedSources }) => pinnedSources),
    actions: sum(({ actions }) => actions),
    trackedActions: sum(({ trackedActions }) => trackedActions),
  };
  return { totals, connectors: rows, lines: renderDriftCoverage({ totals, connectors: rows }) };
};

/** The coverage as the build annotation and the CLI log show it, one line per entry. */
export const renderDriftCoverage = ({
  totals,
  connectors,
}: Pick<DriftCoverage, 'totals' | 'connectors'>): string[] => {
  const lines = [
    `${totals.recorded} of ${totals.connectors} connectors recorded ` +
      `(${totals.exempt} exempt, ${totals.unrecorded} neither)`,
    `${totals.canDetectChange} of ${totals.checked} checked can detect a vendor change ` +
      `(${totals.pinnedSources} of ${totals.sources} sources pinned)`,
    `${totals.trackedActions} of ${totals.actions} actions call an operation a spec describes`,
    ...(totals.failed > 0 ? [`${totals.failed} connector(s) could not be checked`] : []),
  ];
  const untracked = connectors.filter(({ untrackedActions }) => untrackedActions > 0);
  if (untracked.length > 0) {
    lines.push('', 'Connectors with actions no spec describes:');
    for (const { connector, trackedActions, actions } of untracked) {
      lines.push(`- \`${connector}\`: ${trackedActions} of ${actions} tracked`);
    }
  }
  return lines;
};
