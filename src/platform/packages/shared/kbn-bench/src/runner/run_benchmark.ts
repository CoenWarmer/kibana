/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';

import type { Benchmark, LoadedBenchConfig } from '../config/types';
import { getFileBaseDir } from '../filesystem/get_file_base_dir';
import type { GlobalRunContext } from '../types';
import { clearExistingProfiles } from './profile/clear_existing_profiles';
import { collectAndMergeCpuProfiles } from './profile/collect_and_merge_profiles';
import type {
  BenchmarkResult,
  BenchmarkRunContext,
  BenchmarkRunResult,
  BenchmarkRunReturn,
  BenchmarkRunnable,
} from './types';
import { wrapInProfiler } from './profile/wrap_in_profiler';

function createCallbackWrapper(
  context: BenchmarkRunContext,
  timeout: number
): <T extends ((ctx: BenchmarkRunContext) => Promise<any>) | undefined>(
  name: string,
  cb?: T
) => Promise<T extends Function ? Awaited<ReturnType<T>> : void> {
  return (name, cb) => {
    if (!cb) {
      return Promise.resolve();
    }

    context.log.debug(`Starting ${name}`);

    return Promise.race([
      cb(context)
        .then((val) => {
          context.log.debug(`Completed ${name}`);
          return val;
        })
        .catch((error) => {
          context.log.warning(`${name} failed with ${error}`);
          throw error;
        }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(`Timeout ${name}: timeout of ${timeout}ms reached before promise resolved`)
          );
        }, timeout).unref();
      }),
    ]);
  };
}

async function runAll({
  config,
  hooks,
}: {
  config: LoadedBenchConfig;
  hooks: {
    before?: () => Promise<void>;
    run: () => Promise<BenchmarkRunReturn | void>;
    after?: () => Promise<void>;
  };
}) {
  const results: BenchmarkRunResult[] = [];

  const run = async () => {
    try {
      await hooks.before?.();

      const start = performance.now();
      const result = await hooks?.run();

      const metrics = result && result.metrics ? result.metrics : {};

      results.push({
        metrics,
        status: 'completed',
        time: performance.now() - start,
      });

      await hooks.after?.();
    } catch (error) {
      results.push({
        error,
        status: 'failed',
      });
    }
  };

  for (let i = 0; i < config.runs; i++) {
    await run();
  }

  return results;
}

export async function runBenchmark({
  context,
  config,
  benchmark,
  runnable,
}: {
  context: GlobalRunContext;
  config: LoadedBenchConfig;
  benchmark: Benchmark;
  runnable: BenchmarkRunnable;
}): Promise<BenchmarkResult> {
  const { log: parentLog, workspaceDir, ref } = context;
  const log = parentLog.withContext('bench');

  parentLog.info(
    `Start benchmark name=${benchmark.name} kind=${benchmark.kind} runs=${config.runs}`
  );

  const benchmarkContext: BenchmarkRunContext = {
    log,
    workspaceDir,
    ref,
  };

  const wrapInTimeout = createCallbackWrapper(benchmarkContext, config.timeout);

  const testResultsBaseDir = Path.join(
    getFileBaseDir({
      ...context,
      configName: config.name,
    }),
    benchmark.name
  );

  const results: BenchmarkRunResult[] = [];

  const profilesDir = testResultsBaseDir;

  await clearExistingProfiles(context.log, profilesDir);

  try {
    await wrapInTimeout(`${benchmark.name}:beforeAll()`, runnable.beforeAll);

    const runCb = () =>
      runAll({
        config,
        hooks: {
          before: () => wrapInTimeout(`${benchmark.name}:before()`, runnable.before),
          run: () => wrapInTimeout(`${benchmark.name}:run()`, runnable.run),
          after: () => wrapInTimeout(`${benchmark.name}:after()`, runnable.after),
        },
      });

    const resultsFromRun = config.profile
      ? await wrapInProfiler(profilesDir, runCb)
      : await runCb();

    results.push(...resultsFromRun);
  } finally {
    await wrapInTimeout(`${benchmark.name}:afterAll()`, runnable.afterAll);
  }

  let profile;

  if (config.profile) {
    profile = await collectAndMergeCpuProfiles({
      profilesDir,
      name: benchmark.name,
      log,
    });
  }

  return {
    benchmark,
    runs: results,
    profile,
  };
}
