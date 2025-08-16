/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import Path from 'path';
import * as Fs from 'fs/promises';
import type { ToolingLog } from '@kbn/tooling-log';
import { shell } from './shell';

interface EnsureTempRepoOptions {
  log: ToolingLog;
  repositoryDir: string;
  destinationDir: string;
}

export async function ensureTempRepo({
  log,
  repositoryDir,
  destinationDir,
}: EnsureTempRepoOptions) {
  const pathExists = async (path: string) => {
    return Fs.access(path)
      .then(() => true)
      .catch(() => false);
  };

  const destinationExists = await pathExists(destinationDir);

  if (!destinationExists) {
    await Fs.mkdir(destinationDir, { recursive: true });

    log.info(`Cloning repo into ${destinationDir}`);

    await shell({ log, cwd: destinationDir, cmd: `git clone ${repositoryDir} .` });

    return;
  }

  const [sourceGitFileExists, destGitFileExists] = await Promise.all([
    pathExists(Path.join(repositoryDir, '.git')),
    pathExists(Path.join(destinationDir, '.git')),
  ]);

  if (!sourceGitFileExists) {
    throw new Error(`${repositoryDir} is not a git repository`);
  }

  if (!destGitFileExists) {
    throw new Error(`Destination directory ${destinationDir} exists but is not a git repository`);
  }

  await shell({ log, cwd: destinationDir, cmd: 'git fetch --all --prune' }).catch((err) => {
    throw new Error(`Failed to fetch from remote in ${destinationDir}`, { cause: err });
  });
}
