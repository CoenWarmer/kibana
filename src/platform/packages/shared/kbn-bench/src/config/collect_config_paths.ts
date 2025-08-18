/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import path from 'path';
import fastGlob from 'fast-glob';
import { REPO_ROOT } from '@kbn/repo-info';

export function collectConfigPaths({ glob }: { glob: string | string[] }): string[] {
  const globs = Array.isArray(glob) ? glob : [glob];
  const patterns = globs.map((g) =>
    path.isAbsolute(g)
      ? path.join(g, '**/benchmark.config.ts')
      : path.join(REPO_ROOT, g, '**/benchmark.config.ts')
  );
  const files = patterns.flatMap((p) =>
    fastGlob.sync(p, { onlyFiles: true, followSymbolicLinks: false, ignore: ['node_modules'] })
  );
  return files;
}
