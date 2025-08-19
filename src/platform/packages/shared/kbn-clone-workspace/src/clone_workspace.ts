/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import Path from 'path';
import { REPO_ROOT } from '@kbn/repo-info';
import execa from 'execa';
import type { CloneWorkspaceOptions, CloneWorkspaceResult } from './types';
import { ensureTempRepo } from './ensure_temp_repo';
import { checkoutAndBootstrap } from './checkout_and_bootstrap';

/**
 * Ensure a temporary Kibana workspace exists, checks out the requested ref,
 * and bootstraps dependencies so follow-up build or analysis steps can run
 * without invoking a full local environment setup each time.
 *
 * The function is idempotent for an existing destination directory: it will
 * reuse the clone (fetching updates) rather than recloning. Use {@link CloneWorkspaceOptions.force}
 * to discard local changes and force dependency (re)installation.
 *
 * @param options {@link CloneWorkspaceOptions}
 * @returns {@link CloneWorkspaceResult} containing the absolute path of the prepared workspace
 */
export async function cloneWorkspace(
  options: CloneWorkspaceOptions
): Promise<CloneWorkspaceResult> {
  const destinationDir = options.tmpDir || Path.join(REPO_ROOT, 'data', 'kibana-workspace');
  const force = options.force ?? false;
  const log = options.log;

  await ensureTempRepo({
    repositoryDir: REPO_ROOT,
    destinationDir,
    log,
  });
  // record current HEAD (may fail on fresh clone before first checkout)
  let beforeRef: string | undefined;
  try {
    const { stdout } = await execa('git', ['rev-parse', 'HEAD'], { cwd: destinationDir });
    beforeRef = stdout.trim();
  } catch {
    // ignore
  }

  await checkoutAndBootstrap({
    force,
    log,
    ref: options.ref,
    repositoryDir: destinationDir,
  });

  let afterRef: string | undefined;
  try {
    const { stdout } = await execa('git', ['rev-parse', 'HEAD'], { cwd: destinationDir });
    afterRef = stdout.trim();
  } catch {
    // ignore
  }

  return {
    dest: destinationDir,
    changed: beforeRef !== afterRef,
  };
}
