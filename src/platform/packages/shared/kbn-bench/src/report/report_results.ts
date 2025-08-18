/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import { table } from 'table';
import chalk from 'chalk';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ToolingLog } from '@kbn/tooling-log';
import type { ConfigResult } from '../runner/types';
import { formatDuration, summarizeBenchmark } from './report_utils';

export function reportResults(log: ToolingLog, results: ConfigResult[]) {
  const lines: string[] = [];

  if (!results.length) {
    lines.push('No benchmark results to report');
  }

  for (const configResult of results) {
    const relPath = `./${Path.relative(REPO_ROOT, configResult.config.path)}`;
    lines.push('');
    lines.push(`${chalk.bold.cyan('Benchmark config:')} ${relPath}`);

    for (const benchResult of configResult.benchmarks) {
      const s = summarizeBenchmark(benchResult);
      const statusPart = s.failed
        ? chalk.red(` (fail ${s.failed}/${s.completed + s.failed})`)
        : chalk.dim(` (${s.completed} run${s.completed === 1 ? '' : 's'})`);
      const title = `${chalk.bold(s.name)}${statusPart}`;
      lines.push(title);

      const metricKeys = Object.keys(s.metricsAvg).sort();
      const header = [chalk.bold('Metric'), chalk.bold('Avg'), chalk.bold('Std Dev')];
      const rows: string[][] = [];

      rows.push([
        'Time',
        s.avgTime != null ? chalk.yellow(formatDuration(s.avgTime)) : '—',
        s.stdDevTime != null ? chalk.dim(formatDuration(s.stdDevTime)) : '—',
      ]);

      for (const key of metricKeys) {
        rows.push([
          key,
          s.metricsAvg[key] != null ? chalk.cyan(s.metricsAvg[key].toFixed(2)) : '—',
          s.metricsStdDev[key] != null ? chalk.dim(s.metricsStdDev[key].toFixed(2)) : '—',
        ]);
      }

      const tbl = table([header, ...rows], {
        border: {
          topBody: '',
          topJoin: '',
          topLeft: '',
          topRight: '',
          bottomBody: '',
          bottomJoin: '',
          bottomLeft: '',
          bottomRight: '',
          bodyLeft: '',
          bodyRight: '',
          bodyJoin: ' ',
          joinBody: '',
          joinLeft: '',
          joinRight: '',
          joinJoin: ' ',
        },
        singleLine: true,
      });

      lines.push(...tbl.split('\n'));
    }
  }

  if (lines.length) {
    log.info('\n' + lines.join('\n'));
  }
}
