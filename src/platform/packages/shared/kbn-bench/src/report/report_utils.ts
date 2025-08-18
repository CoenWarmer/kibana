/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Shared utilities for benchmark reporting.
import type { BenchmarkRunResultCompleted, BenchmarkResult, ConfigResult } from '../runner/types';

export interface BenchmarkSummary {
  name: string;
  completed: number;
  failed: number;
  avgTime?: number;
  stdDevTime?: number;
  minTime?: number;
  maxTime?: number;
  metricsAvg: Record<string, number>; // averaged metrics
  metricsStdDev: Record<string, number>; // std dev per metric
}

export function formatDuration(ms: number | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  const fixed = s % 1 === 0 ? s.toFixed(0) : s.toFixed(1);
  return `${fixed}s`;
}

export function summarizeBenchmark(result: BenchmarkResult): BenchmarkSummary {
  const completed = result.runs.filter(
    (r): r is BenchmarkRunResultCompleted => r.status === 'completed'
  );
  const failed = result.runs.length - completed.length;

  const times = completed.map((r) => r.time);
  const avgTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : undefined;
  const minTime = times.length ? Math.min(...times) : undefined;
  const maxTime = times.length ? Math.max(...times) : undefined;

  const metricSums = new Map<string, { total: number; count: number; values: number[] }>();
  for (const run of completed) {
    for (const [k, v] of Object.entries(run.metrics)) {
      const val = typeof v === 'number' ? v : v.value;
      if (typeof val !== 'number' || Number.isNaN(val)) continue;
      const curr = metricSums.get(k) || { total: 0, count: 0, values: [] };
      curr.total += val;
      curr.count += 1;
      curr.values.push(val);
      metricSums.set(k, curr);
    }
  }
  const metricsAvg: Record<string, number> = {};
  const metricsStdDev: Record<string, number> = {};
  for (const [k, { total, count, values }] of metricSums) {
    const mean = total / count;
    metricsAvg[k] = mean;
    if (values.length > 1) {
      const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
      metricsStdDev[k] = Math.sqrt(variance);
    } else {
      metricsStdDev[k] = 0;
    }
  }

  let stdDevTime: number | undefined;
  if (times.length > 1 && avgTime != null) {
    const variance = times.reduce((acc, t) => acc + Math.pow(t - avgTime, 2), 0) / times.length;
    stdDevTime = Math.sqrt(variance);
  } else if (times.length === 1) {
    stdDevTime = 0;
  }

  return {
    name: result.benchmark.name,
    completed: completed.length,
    failed,
    avgTime,
    stdDevTime,
    minTime,
    maxTime,
    metricsAvg,
    metricsStdDev,
  };
}

export function collectMetricKeys(config: ConfigResult): string[] {
  const set = new Set<string>();
  for (const b of config.benchmarks) {
    for (const run of b.runs) {
      if (run.status === 'completed') {
        for (const key of Object.keys(run.metrics)) set.add(key);
      }
    }
  }
  return Array.from(set).sort();
}
