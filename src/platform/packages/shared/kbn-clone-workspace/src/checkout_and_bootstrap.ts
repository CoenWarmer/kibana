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
import Fs from 'fs/promises';
import Path from 'path';
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
  force = false,
}: CheckoutAndBootstrapOptions) {
  await shell({
    log,
    cwd: repositoryDir,
    cmd: `git checkout --force ${ref}`,
  });

  // Ensure the workspace's package.json engines.node matches the currently running Node.js
  // version. This prevents engine checks from failing when checking out an older ref that
  // specifies an out-of-date engine range compared to the version actually in use.
  try {
    const pkgPath = Path.join(repositoryDir, 'package.json');
    const raw = await Fs.readFile(pkgPath, 'utf8');
    interface PkgJsonEngines {
      node?: string;
      [k: string]: string | undefined;
    }
    const pkg = JSON.parse(raw) as { engines?: PkgJsonEngines };
    const currentNodeVersion = process.version.replace(/^v/, '');

    if (!pkg.engines) {
      pkg.engines = { node: currentNodeVersion };
    } else if (pkg.engines.node !== currentNodeVersion) {
      pkg.engines.node = currentNodeVersion;
    }

    // Rewrite only if changed or engines was missing
    const updated = JSON.stringify(pkg, null, 2) + '\n';
    if (updated !== raw) {
      await Fs.writeFile(pkgPath, updated, 'utf8');
      log.info(`Updated package.json engines.node -> ${currentNodeVersion}`);
    } else {
      log.debug('package.json engines.node already matches current Node version');
    }

    // Also overwrite .node-version to pin the runtime explicitly for subsequent tooling
    try {
      const nodeVersionFile = Path.join(repositoryDir, '.node-version');
      await Fs.writeFile(nodeVersionFile, `${currentNodeVersion}\n`, 'utf8');
      log.info(`Wrote .node-version -> ${currentNodeVersion}`);
    } catch (nodeVersionErr) {
      log.warning(`Failed to write .node-version file: ${(nodeVersionErr as Error).message}`);
    }
  } catch (err) {
    log.warning(`Failed to update package.json engines.node: ${(err as Error).message}`);
  }

  // Persist current Node version to .nvmrc as well (used by nvm tooling)
  try {
    const currentNodeVersion = process.version.replace(/^v/, '');
    const nvmrcPath = Path.join(repositoryDir, '.nvmrc');
    await Fs.writeFile(nvmrcPath, `${currentNodeVersion}\n`, 'utf8');
    log.info(`Wrote .nvmrc -> ${currentNodeVersion}`);
  } catch (err) {
    log.warning(`Failed to write .nvmrc: ${(err as Error).message}`);
  }

  // Apply yarn config overrides to avoid engine enforcement within cloned workspace
  try {
    await shell({
      log,
      cwd: repositoryDir,
      cmd: 'yarn config set ignore-engines true',
    });
    await shell({
      log,
      cwd: repositoryDir,
      cmd: 'yarn config set enableStrictSsl false',
    });
  } catch (err) {
    log.warning(`Failed to apply yarn config overrides: ${(err as Error).message}`);
  }

  await shell({
    log,
    cwd: repositoryDir,
    cmd: `yarn kbn bootstrap ${force ? '--force-install' : ''}`,
    env: {
      ...process.env,
      UNSAFE_DISABLE_NODE_VERSION_VALIDATION: '1',
      YARN_IGNORE_ENGINES: 'true',
    },
  });
}
