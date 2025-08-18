/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { cloneWorkspace } from '@kbn/clone-workspace';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ToolingLog } from '@kbn/tooling-log';
import execa from 'execa';

import { collectAndRun } from './collect_and_run';
import { getGlobalConfig } from './config/get_global_config';
import type { GlobalBenchConfig } from './config/types';
import { reportDiff } from './report/report_diff';
import { reportResults } from './report/report_results';
import { writeResults } from './write_results';
import { getDefaultDataDir } from './filesystem/get_default_data_dir';
import type { GlobalRunContext } from './types';
import { collectAndRunForCompare } from './collect_and_run_for_compare';

export async function bench({
  log,
  config: configGlob,
  compare: compareRef,
  profile,
  openProfile,
  grep,
}: {
  log: ToolingLog;
  config?: string | string[];
  compare?: string;
  profile?: boolean;
  openProfile?: boolean;
  grep?: string | string[];
}) {
  const baseRef = (await execa('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT })).stdout.trim();

  log.debug(`Base ref resolved: ${baseRef}`);

  const globalConfig = getGlobalConfig();
  const grepArray = Array.isArray(grep) ? grep : grep ? [grep] : undefined;
  const runtimeOverrides: Partial<GlobalBenchConfig> = { profile, openProfile, grep: grepArray };

  const globalRunContext: Omit<GlobalRunContext, 'ref' | 'workspaceDir'> = {
    globalConfig,
    runtimeOverrides,
    dataDir: getDefaultDataDir(),
    baseWorkspaceDir: REPO_ROOT,
    log,
  };

  const baseRefContext: GlobalRunContext = {
    ...globalRunContext,
    workspaceDir: globalRunContext.baseWorkspaceDir,
    ref: baseRef,
  };

  log.info(`Running benchmarks for base ref (${baseRef})`);

  const baseRefResults = await collectAndRun({
    configGlob,
    context: baseRefContext,
  });

  log.info(`Completed benchmarks for base ref (${baseRef})`);

  await writeResults(baseRefContext, baseRefResults);
  log.debug(`Wrote results for base ref (${baseRef})`);

  if (!compareRef) {
    log.info('No compare ref provided; reporting single-run results');
    reportResults(log, baseRefResults);
    return;
  }

  // Expand compare ref to full hash if it's abbreviated
  const fullCompareRef = (
    await execa('git', ['rev-parse', compareRef!], { cwd: REPO_ROOT })
  ).stdout.trim();

  const { dest } = await cloneWorkspace({ ref: fullCompareRef, log });

  log.info(`Cloned compare ref ${fullCompareRef} to ${dest}`);

  const compareRefContext: GlobalRunContext = {
    ...globalRunContext,
    workspaceDir: dest,
    ref: fullCompareRef,
  };

  log.info(`Running benchmarks for compare ref (${fullCompareRef})`);

  const compareRefResults = await collectAndRunForCompare({
    context: compareRefContext,
    baseRefResults,
  });

  log.info(`Completed benchmarks for compare ref (${fullCompareRef})`);

  await writeResults(compareRefContext, compareRefResults);

  log.debug(`Wrote results for compare ref (${fullCompareRef})`);

  reportDiff(
    log,
    {
      ref: baseRef,
      results: baseRefResults,
      dir: REPO_ROOT,
    },
    {
      ref: fullCompareRef,
      results: compareRefResults,
      dir: dest,
    }
  );
  log.info('Benchmark diff reported');
}
