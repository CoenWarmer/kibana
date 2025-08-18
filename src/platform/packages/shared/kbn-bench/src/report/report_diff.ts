/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import chalk from 'chalk';
import { table } from 'table';
import type { ToolingLog } from '@kbn/tooling-log';
import type { ConfigResult } from '../runner/types';
import { summarizeBenchmark, formatDuration } from './report_utils';

interface ResultSet {
  ref: string;
  dir: string;
  results: ConfigResult[];
}

function colorDelta(base: number | undefined, next: number | undefined, invert = false) {
  if (base == null || next == null) return '—';
  const diff = next - base;
  const pct = base === 0 ? 0 : (diff / base) * 100;
  const sign = diff === 0 ? '' : diff > 0 ? '+' : '';
  const formatted = `${sign}${diff.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
  const improved = invert ? diff > 0 : diff < 0; // invert when higher is better
  if (diff === 0) return chalk.dim(formatted);
  return improved ? chalk.green(formatted) : chalk.red(formatted);
}

function renderBenchmarkDiff(
  log: ToolingLog,
  baseCfg: ConfigResult | undefined,
  nextCfg: ConfigResult | undefined,
  baseRef: string,
  nextRef: string
) {
  // Map benchmark name -> summary
  const baseMap = new Map<string, ReturnType<typeof summarizeBenchmark>>();
  const nextMap = new Map<string, ReturnType<typeof summarizeBenchmark>>();

  if (baseCfg) {
    for (const b of baseCfg.benchmarks) {
      baseMap.set(b.benchmark.name, summarizeBenchmark(b));
    }
  }
  if (nextCfg) {
    for (const b of nextCfg.benchmarks) {
      nextMap.set(b.benchmark.name, summarizeBenchmark(b));
    }
  }

  const allNames = Array.from(new Set([...baseMap.keys(), ...nextMap.keys()])).sort();

  for (const name of allNames) {
    const baseSummary = baseMap.get(name);
    const nextSummary = nextMap.get(name);

    const statusText = (() => {
      if (!baseSummary) return chalk.green('added');
      if (!nextSummary) return chalk.red('removed');
      if (nextSummary.failed) return chalk.red('fail');
      if (baseSummary.failed && !nextSummary.failed) return chalk.green('fixed');
      return 'ok';
    })();

    const rows: string[][] = [];

    const timeRow = (label: string, getter: (s: typeof baseSummary) => number | undefined) => {
      const baseVal = baseSummary && getter(baseSummary);
      const nextVal = nextSummary && getter(nextSummary);
      const baseStr = baseVal != null ? formatDuration(baseVal) : '—';
      const nextStr = nextVal != null ? formatDuration(nextVal) : '—';
      const delta = colorDelta(baseVal, nextVal); // lower is better for time
      rows.push([label, `${baseStr} -> ${nextStr}`, delta]);
    };

    timeRow('Avg Time', (s) => s?.avgTime);
    timeRow('Std Dev', (s) => s?.stdDevTime);

    const baseMetrics = baseSummary ? Object.keys(baseSummary.metricsAvg) : [];
    const nextMetrics = nextSummary ? Object.keys(nextSummary.metricsAvg) : [];
    const allMetricKeys = Array.from(new Set([...baseMetrics, ...nextMetrics])).sort();

    for (const key of allMetricKeys) {
      const baseAvg = baseSummary?.metricsAvg[key];
      const nextAvg = nextSummary?.metricsAvg[key];
      const baseStd = baseSummary?.metricsStdDev[key];
      const nextStd = nextSummary?.metricsStdDev[key];
      const baseStr = baseAvg != null ? baseAvg.toFixed(2) : '—';
      const nextStr = nextAvg != null ? nextAvg.toFixed(2) : '—';
      const baseStdStr = baseStd != null ? chalk.dim(baseStd.toFixed(2)) : chalk.dim('—');
      const nextStdStr = nextStd != null ? chalk.dim(nextStd.toFixed(2)) : chalk.dim('—');
      const delta = colorDelta(baseAvg, nextAvg, false); // lower better assumed
      rows.push([`${key} (σ)`, `${baseStdStr} -> ${nextStdStr}`, chalk.dim('')]);
      rows.push([key, `${baseStr} -> ${nextStr}`, delta]);
    }

    const runInfo = (() => {
      if (!nextSummary) return '';
      const total = nextSummary.completed + nextSummary.failed;
      if (nextSummary.failed) {
        return chalk.red(` ${nextSummary.failed}/${total} failed`);
      }
      return chalk.dim(` ${total} run${total === 1 ? '' : 's'}`);
    })();
    const nameCol = `${name}${runInfo} ${chalk.dim(`[${statusText}]`)}`;
    const header = [chalk.bold(nameCol), chalk.bold(`${baseRef} -> ${nextRef}`), chalk.bold('Δ')];

    const output = table([header, ...rows], {
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

    return output.split('\n');
  }
}

export function reportDiff(log: ToolingLog, from: ResultSet, to: ResultSet) {
  const baseRef = from.ref;
  const nextRef = to.ref;

  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold.cyan(`Benchmark diff: ${baseRef} -> ${nextRef}`));

  // Match configs by relative path
  const byPath = (rs: ResultSet) => {
    const map = new Map<string, ConfigResult>();
    for (const cfg of rs.results) {
      const rel = `./${Path.relative(rs.dir, cfg.config.path)}`;
      map.set(rel, cfg);
    }
    return map;
  };

  const fromMap = byPath(from);
  const toMap = byPath(to);
  const allPaths = Array.from(new Set([...fromMap.keys(), ...toMap.keys()])).sort();

  for (const relPath of allPaths) {
    const baseCfg = fromMap.get(relPath);
    const nextCfg = toMap.get(relPath);
    lines.push(chalk.bold(`Config: ${relPath}`));
    const rendered = renderBenchmarkDiff(log as any, baseCfg, nextCfg, baseRef, nextRef);
    if (rendered) {
      lines.push(...rendered, '');
    }
  }

  log.info('\n' + lines.join('\n'));
}
