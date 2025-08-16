/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
/**
 * Shared utilities for preparing a temporary Kibana repo checkout for tasks like bundle size comparison.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import { shell } from './shell';

interface CheckoutAndBootstrapOptions {
  log: ToolingLog;
  repositoryDir: string;
  force: boolean;
  ref: string;
}

export async function checkoutAndBootstrap({
  repositoryDir,
  ref,
  log,
  force = true,
}: CheckoutAndBootstrapOptions) {
  await shell({
    log,
    cwd: repositoryDir,
    cmd: `git checkout ${force ? '--force ' : ''}${ref}`,
  });

  await shell({
    log,
    cwd: repositoryDir,
    cmd: `yarn kbn bootstrap ${force ? '--force-install' : ''}`,
  });
}
