/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import execa from 'execa';
import type { ExecaReturnValue } from 'execa';

export async function shell(
  command: string,
  {
    log,
    cwd,
    env = {},
    capture = false,
  }: {
    log: ToolingLog;
    cwd: string;
    env?: Record<string, string>;
    capture?: boolean; // when true, capture stdout/stderr instead of inheriting
  }
): Promise<ExecaReturnValue<string>> {
  log.debug(`$ (cwd: ${cwd}) ${command}`);
  const stdio = capture ? 'pipe' : 'inherit';
  // execa handles errors by throwing with stdout/stderr attached
  return execa(command, {
    cwd,
    shell: true,
    env: { ...process.env, ...env, UNSAFE_DISABLE_NODE_VERSION_VALIDATION: '1' },
    stdio,
  });
}
