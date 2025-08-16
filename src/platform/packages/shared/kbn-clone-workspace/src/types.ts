/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';

/**
 * Options for cloning (or reusing) a temporary Kibana workspace aimed at
 * performing read/build style tasks (e.g. bundle size comparison) against a ref.
 */
export interface CloneWorkspaceOptions {
  /**
   * Git ref (branch, tag, or commit SHA) to checkout after ensuring the temp repo exists.
   */
  ref: string;
  /**
   * When true, perform a forced checkout (discarding local changes) and force install during bootstrap.
   * Defaults to false.
   */
  force?: boolean;
  /**
   * Explicit path to use as the destination working copy. If omitted a stable directory inside the OS temp dir is used.
   */
  tmpDir?: string;
  /** Logger utility used for progress and debug output. */
  log: ToolingLog;
}

/**
 * Result returned from {@link cloneWorkspace} describing the prepared working copy.
 */
export interface CloneWorkspaceResult {
  /** Absolute path on disk to the cloned (or reused) working copy. */
  dest: string;
}
