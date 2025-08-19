/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import Fs from 'fs/promises';
import execa, { type ExecaChildProcess } from 'execa';
import type { ToolingLog } from '@kbn/tooling-log';
import { DOWNLOAD_PLATFORMS, type Platform } from '../../../../../dev/build/lib/platform';

interface BuildInfo {
  sha: string;
  number: number;
  date: string;
  version: string;
  path: string; // root of built kibana
}

async function ensureKibanaBuild({
  log,
  cwd,
  ref,
  cache,
}: {
  log: ToolingLog;
  cwd: string;
  ref: string;
  cache: boolean;
}): Promise<BuildInfo> {
  const buildRoot = Path.join(cwd, 'build', 'kibana');
  const pkgPath = Path.join(buildRoot, 'package.json');

  let existing: BuildInfo | undefined;
  try {
    const raw = await Fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    if (pkg.build?.sha) {
      existing = {
        sha: pkg.build.sha,
        number: pkg.build.number,
        date: pkg.build.date,
        version: pkg.version,
        path: buildRoot,
      };
    }
  } catch {
    // ignore
  }

  // Decide if we need to build: missing marker, no existing info, sha mismatch vs ref, or cache disabled.
  // If the provided ref is a short hash (<=12 chars) allow prefix matching against the full build sha.
  const isShortRef = ref.length <= 12;
  const matchesRef =
    existing && (existing.sha === ref || (isShortRef && existing.sha.startsWith(ref)));
  const needBuild = !cache || !existing || !matchesRef;
  if (existing) {
    if (needBuild) {
      log.info(
        `Kibana build cache mismatch (have sha=${existing.sha} version=${existing.version})` +
          ` expected ref=${ref}${isShortRef ? ' (short)' : ''}; rebuilding`
      );
    } else {
      log.debug(
        `Reusing existing Kibana build sha=${existing.sha} version=${existing.version}` +
          ` (cache hit, ref=${ref}$${isShortRef ? ' (short)' : ''})`
      );
    }
  } else if (!existing) {
    log.info(`No existing Kibana build found at ${buildRoot}; building (ref=${ref})`);
  }
  if (needBuild) {
    const start = performance.now();
    log.info('Starting Kibana build');
    await execa(
      'node',
      [
        'scripts/build',
        '--skip-archives',
        '--skip-cdn-assets',
        '--skip-os-packages',
        '--skip-docker-cloud',
        '--skip-docker-serverless',
        '--skip-docker-contexts',
      ],
      {
        cwd,
        stdio: 'inherit',
      }
    );
    log.info(`Kibana build finished in ${Math.round((performance.now() - start) / 1000)}s`);

    // reread package.json
    const raw = await Fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    existing = {
      sha: pkg.build?.sha || ref,
      number: pkg.build?.number || 0,
      date: pkg.build?.date || new Date().toISOString(),
      version: pkg.version,
      path: buildRoot,
    };
  }

  if (!existing) {
    throw new Error('Build failed to produce package.json with build info');
  }

  return existing;
}

async function waitForStdout({
  log,
  proc,
  search,
}: {
  log: ToolingLog;
  proc: ExecaChildProcess;
  search: string | RegExp;
}): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    function handleData(data: any) {
      const line: string = data.toString();
      log.verbose(line);
      const isMatch = typeof search === 'string' ? line.includes(search) : search.test(line);

      if (isMatch) {
        proc.stdout?.off('data', handleData);
        resolve(line);
      }
    }

    proc.stdout?.on('data', handleData);

    proc.on('exit', (code) =>
      reject(new Error(`Process "${proc.spawnargs.join(' ')}" exited early with code ${code}`))
    );

    proc.on('error', reject);
  });
}

async function startEs({
  cwd,
  log: parentLog,
  args = [],
}: {
  cwd: string;
  log: ToolingLog;
  args?: string[];
}): Promise<{ proc: ExecaChildProcess; port: number }> {
  const log = parentLog.withContext('es-start');

  log.info('Starting Elasticsearch');

  const [file, ...cmdArgs] = ['node', 'scripts/es.js', 'snapshot', ...args];
  log.debug(`Spawning "${file} ${cmdArgs.join(' ')}"`);

  const proc: ExecaChildProcess = execa(file, cmdArgs, { cwd });

  const regex = /AbstractHttpServerTransport.*publish_address .*:(\d+)/;

  const publishAddressOut = await waitForStdout({ proc, log, search: regex });
  log.debug(`Elasticsearch publish address line: ${publishAddressOut.toString().trim()}`);

  const match = publishAddressOut.match(regex);

  const discoveredPort = match ? Number(match[1]) : undefined;

  if (!discoveredPort) {
    throw new Error('Failed to determine Elasticsearch port');
  }

  log.info(`Elasticsearch running on port ${discoveredPort}`);

  await waitForStdout({
    proc,
    log,
    search: 'kbn/es setup complete',
  });
  log.debug('Elasticsearch reported setup complete');

  return { proc, port: discoveredPort };
}

async function startKibana({
  cwd,
  log: parentLog,
  port,
  esPort,
  esUsername = 'kibana_system',
  esPassword = 'changeme',
  args = [],
}: {
  cwd: string;
  log: ToolingLog;
  port: number; // desired kibana server.port
  esPort: number; // actual es http port discovered from startEs
  esUsername?: string;
  esPassword?: string;
  args?: string[];
}): Promise<{ proc: ExecaChildProcess }> {
  // Discover the built distribution directory dynamically so we don't have to
  // know the version/platform ahead of time.

  const log = parentLog.withContext('kbn-start');

  const defaultBuildRoot = Path.join(cwd, 'build', 'default');
  const nodePlatform = process.platform as 'darwin' | 'linux' | 'win32';
  const nodeArch = (process.arch === 'arm64' ? 'arm64' : 'x64') as 'arm64' | 'x64';
  const platform = DOWNLOAD_PLATFORMS.find(
    (platformCandidate: Platform) =>
      platformCandidate.getName() === nodePlatform &&
      platformCandidate.getArchitecture() === nodeArch
  );

  if (!platform) {
    throw new Error(`Unsupported platform ${nodePlatform}-${process.arch}`);
  }

  const buildName = platform.getBuildName();
  log.debug(`Detected node platform=${nodePlatform} arch=${nodeArch} => buildName=${buildName}`);

  let distDir: string | undefined;
  try {
    const entries = await Fs.readdir(defaultBuildRoot, { withFileTypes: true });
    const match = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('kibana-'))
      .map((entry) => entry.name)
      .find((candidateName) => candidateName.endsWith(buildName));

    if (match) {
      const candidatePath = Path.join(defaultBuildRoot, match);
      await Fs.access(Path.join(candidatePath, 'bin', 'kibana'));
      distDir = candidatePath;
      log.debug(`Found Kibana dist dir: ${distDir}`);
    }
  } catch {
    // ignore, will handle missing below
  }

  if (!distDir) {
    throw new Error(
      `Unable to locate built Kibana distribution for buildName "${buildName}" under ${defaultBuildRoot}`
    );
  }

  const binFile = Path.join(distDir, 'bin', 'kibana');

  // Write config file instead of relying on CLI flags so we test the shipped config path
  const configDir = Path.join(distDir, 'config');
  const configPath = Path.join(configDir, 'kibana.yml');
  const yamlLines = [
    '# Auto-generated by benchmarks startKibana()',
    `server.port: ${port}`,
    `elasticsearch.hosts: ["http://localhost:${esPort}"]`,
    `elasticsearch.username: ${esUsername}`,
    `elasticsearch.password: ${esPassword}`,
  ];
  await Fs.writeFile(configPath, yamlLines.join('\n'), 'utf8');
  log.info(
    `Wrote Kibana config at ${configPath} (server.port=${port} esPort=${esPort} esUser=${esUsername} esPass=<redacted>)`
  );

  const [file, ...cmdArgs] = [binFile, '--config', configPath, ...args];

  log.info(`Starting Kibana via --config ./config/kibana.yml (port ${port}, ES port ${esPort})`);

  log.debug(
    `Spawning "${file} ${cmdArgs.join(' ')}" in ${cwd}, NODE_OPTIONS=${
      process.env.NODE_OPTIONS ?? '(not set)'
    }, pid=${process.pid}`
  );

  const proc: ExecaChildProcess = execa(file, cmdArgs, { cwd });

  await waitForStdout({
    proc,
    log,
    search: 'Kibana is now available',
  });
  log.info('Kibana is now available');

  // log rest of output while the process is running
  waitForStdout({
    proc,
    log,
    search: 'this_will_never_happen',
  }).catch((error) => {});

  return { proc };
}

export async function stopGracefully(
  proc: ExecaChildProcess,
  {
    name,
    timeoutMs = 15000,
    log,
  }: {
    name: string;
    timeoutMs?: number;
    log: ToolingLog;
  }
) {
  if (proc.exitCode !== null) {
    return;
  }

  log.debug(`Attempting to gracefully shut down ${name} (pid=${proc.pid})`);

  async function sendAndWait(signal: NodeJS.Signals, timeout: number) {
    log.debug(`Sending ${signal} to ${name} (pid=${proc.pid})`);
    proc.kill(signal);

    const waitForProc = proc.then(
      () => true,
      () => true // ignore error rejection caused by signal
    );

    const exited = await Promise.race([
      waitForProc,
      new Promise<boolean>((r) => setTimeout(() => r(false), timeout)),
    ]);

    return exited;
  }

  // Already exited?
  if (proc.exitCode !== null) return;

  if (await sendAndWait('SIGINT', 30000)) {
    log.debug('Gracefully exited after SIGINT');
    return;
  }

  if (await sendAndWait('SIGTERM', 30000)) {
    log.debug('Gracefully exited after SIGTERM');
    return;
  }

  log.warning(`${name} did not exit within ${timeoutMs}ms after SIGINT/SIGTERM, sending SIGKILL`);

  await sendAndWait('SIGKILL', 1000);
}

export { ensureKibanaBuild, startEs, startKibana };
