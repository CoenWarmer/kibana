/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { run } from '@kbn/dev-cli-runner';
import { createFailError } from '@kbn/dev-cli-errors';
import { REPO_ROOT } from '@kbn/repo-info';
import { getPackages, findPackageForPath } from '@kbn/repo-packages';
import type { ToolingLog } from '@kbn/tooling-log';
import { execFileSync } from 'child_process';
import Path from 'path';
import Fs from 'fs';

interface TsConfig {
  kbn_references?: string[];
}

/**
 * Parse a JSONC file (JSON with comments and trailing commas).
 */
function parseJsonc(filePath: string): Record<string, unknown> {
  const content = Fs.readFileSync(filePath, 'utf-8');
  const withoutSingleLineComments = content.replace(/\/\/.*$/gm, '');
  const withoutComments = withoutSingleLineComments.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutTrailingCommas = withoutComments.replace(/,\s*([\]}])/g, '$1');
  return JSON.parse(withoutTrailingCommas);
}

/**
 * Read a tsconfig.json and extract kbn_references.
 */
function readTsConfig(tsconfigPath: string): TsConfig | undefined {
  if (!Fs.existsSync(tsconfigPath)) return undefined;

  try {
    return parseJsonc(tsconfigPath) as unknown as TsConfig;
  } catch {
    return undefined;
  }
}

/**
 * Get the list of changed files compared to a base ref.
 */
function getChangedFiles(baseRef: string, log: ToolingLog): string[] {
  log.info(`Finding changed files compared to ${baseRef}...`);

  let mergeBase: string;
  try {
    mergeBase = execFileSync('git', ['merge-base', baseRef, 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    }).trim();
  } catch {
    log.warning(`Could not find merge-base with ${baseRef}, using ${baseRef} directly`);
    mergeBase = baseRef;
  }

  const diff = execFileSync('git', ['diff', '--name-only', mergeBase, 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });

  // Also include unstaged + staged changes in the working tree
  const diffWorking = execFileSync('git', ['diff', '--name-only'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });

  const diffStaged = execFileSync('git', ['diff', '--name-only', '--cached'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });

  const allFiles = new Set<string>();
  for (const line of [...diff.split('\n'), ...diffWorking.split('\n'), ...diffStaged.split('\n')]) {
    const trimmed = line.trim();
    if (trimmed) allFiles.add(trimmed);
  }

  log.info(`Found ${allFiles.size} changed files`);
  return [...allFiles];
}

/**
 * Build a reverse dependency map: for each package ID, find all packages/plugins
 * that depend on it (via kbn_references in tsconfig.json, or via requiredPlugins /
 * optionalPlugins / requiredBundles in kibana.jsonc).
 */
function buildReverseDependencyMap(
  allPackages: ReturnType<typeof getPackages>,
  log: ToolingLog
): Map<string, Set<string>> {
  log.info('Building reverse dependency map...');

  // Map from plugin.id (camelCase) to the package @kbn/... ID
  const pluginIdToPackageId = new Map<string, string>();
  for (const pkg of allPackages) {
    if (pkg.isPlugin()) {
      pluginIdToPackageId.set(pkg.manifest.plugin.id, pkg.id);
    }
  }

  // reverseDeps: changedPackageId -> Set of dependent package IDs
  const reverseDeps = new Map<string, Set<string>>();

  const addReverseDep = (depId: string, dependentId: string) => {
    let set = reverseDeps.get(depId);
    if (!set) {
      set = new Set();
      reverseDeps.set(depId, set);
    }
    set.add(dependentId);
  };

  for (const pkg of allPackages) {
    // Check tsconfig.json kbn_references
    const tsconfig = readTsConfig(Path.join(pkg.directory, 'tsconfig.json'));
    if (tsconfig?.kbn_references) {
      for (const ref of tsconfig.kbn_references) {
        addReverseDep(ref, pkg.id);
      }
    }

    // Check plugin dependencies (requiredPlugins, optionalPlugins, requiredBundles)
    if (pkg.isPlugin()) {
      const { requiredPlugins, optionalPlugins, requiredBundles } = pkg.manifest.plugin;
      const allPluginDeps = [
        ...(requiredPlugins ?? []),
        ...(optionalPlugins ?? []),
        ...(requiredBundles ?? []),
      ];

      for (const pluginDep of allPluginDeps) {
        const depPackageId = pluginIdToPackageId.get(pluginDep);
        if (depPackageId) {
          addReverseDep(depPackageId, pkg.id);
        }
      }
    }
  }

  return reverseDeps;
}

/**
 * Resolve impacted packages by walking the reverse dependency graph up to a given depth.
 *
 *  - depth=1 (default): only direct dependents of changed packages
 *  - depth=2, 3, ...: walk transitive dependents up to N levels
 *  - depth=0 or Infinity: walk until the graph is fully resolved (transitive closure)
 *
 * Returns a map from package ID to the depth at which it was discovered (0 = directly changed).
 */
function resolveImpactedPackages(
  changedPackageIds: Set<string>,
  reverseDeps: Map<string, Set<string>>,
  maxDepth: number,
  log: ToolingLog
): Map<string, number> {
  const impacted = new Map<string, number>();

  // Seed with directly changed packages at depth 0
  for (const id of changedPackageIds) {
    impacted.set(id, 0);
  }

  // BFS through reverse dependency graph
  let frontier = new Set<string>(changedPackageIds);
  let currentDepth = 0;
  const effectiveMaxDepth = maxDepth === 0 ? Infinity : maxDepth;

  while (frontier.size > 0 && currentDepth < effectiveMaxDepth) {
    currentDepth++;
    const nextFrontier = new Set<string>();

    for (const pkgId of frontier) {
      const dependents = reverseDeps.get(pkgId);
      if (dependents) {
        for (const depId of dependents) {
          if (!impacted.has(depId)) {
            impacted.set(depId, currentDepth);
            nextFrontier.add(depId);
          }
        }
      }
    }

    if (nextFrontier.size > 0) {
      log.info(`  Depth ${currentDepth}: found ${nextFrontier.size} new dependent(s)`);
    }

    frontier = nextFrontier;
  }

  return impacted;
}

run(
  async ({ log, flags }) => {
    const baseRef = (flags['base-ref'] as string) ?? 'main';
    const dryRun = flags['dry-run'] as boolean;
    const useNative = flags.native as boolean;
    const depthFlag = flags.depth as string | undefined;
    const maxDepth = depthFlag === undefined ? 1 : Number(depthFlag);

    if (Number.isNaN(maxDepth) || maxDepth < 0) {
      throw createFailError(
        `Invalid --depth value "${depthFlag}". Must be a non-negative integer (0 = full transitive closure, 1 = direct only).`
      );
    }

    // Step 1: Get changed files
    const changedFiles = getChangedFiles(baseRef, log);
    if (changedFiles.length === 0) {
      log.success('No changed files found. Nothing to type-check.');
      return;
    }

    // Step 2: Discover all packages using @kbn/repo-packages
    const allPackages = getPackages(REPO_ROOT);
    log.info(`Discovered ${allPackages.length} packages in the repository`);

    // Step 3: Map changed files to their owning packages
    const changedPackageIds = new Set<string>();
    for (const file of changedFiles) {
      const absolutePath = Path.resolve(REPO_ROOT, file);
      const pkg = findPackageForPath(REPO_ROOT, absolutePath);
      if (pkg) {
        changedPackageIds.add(pkg.id);
      }
    }

    if (changedPackageIds.size === 0) {
      log.success('No changed files belong to any package. Nothing to type-check.');
      return;
    }

    log.info(`Changed packages (${changedPackageIds.size}):`);
    for (const id of [...changedPackageIds].sort()) {
      log.info(`  - ${id}`);
    }

    // Step 4: Build reverse dependency map and resolve impacted packages
    const reverseDeps = buildReverseDependencyMap(allPackages, log);

    const depthLabel = maxDepth === 0 ? 'full transitive closure' : `depth=${maxDepth}`;
    log.info(`\nResolving impacted packages (${depthLabel})...`);

    const impactedPackages = resolveImpactedPackages(changedPackageIds, reverseDeps, maxDepth, log);

    log.info(`\nTotal impacted packages (${impactedPackages.size}):`);
    for (const [id, depth] of [...impactedPackages.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const label = depth === 0 ? '(changed) ' : `(depth ${depth}) `;
      log.info(`  ${label}${id}`);
    }

    // Step 5: Collect tsconfig.json paths for all impacted packages
    // Build a lookup from package ID to Package instance
    const pkgsById = new Map(allPackages.map((pkg) => [pkg.id, pkg]));

    const tsconfigPaths: string[] = [];
    for (const pkgId of impactedPackages.keys()) {
      const pkg = pkgsById.get(pkgId);
      if (pkg) {
        const tsconfigPath = Path.join(pkg.directory, 'tsconfig.json');
        if (Fs.existsSync(tsconfigPath)) {
          tsconfigPaths.push(Path.relative(REPO_ROOT, tsconfigPath));
        } else {
          log.warning(`No tsconfig.json found for ${pkgId} at ${pkg.directory}`);
        }
      }
    }

    if (tsconfigPaths.length === 0) {
      log.success('No tsconfig.json files found for impacted packages. Nothing to type-check.');
      return;
    }

    log.info(`\nWill type-check ${tsconfigPaths.length} projects:`);
    for (const p of tsconfigPaths.sort()) {
      log.info(`  - ${p}`);
    }

    if (dryRun) {
      log.success('\nDry run complete. Skipping type-check execution.');
      return;
    }

    // Step 6: Run type-check for each impacted project
    const compiler = useNative ? 'tsgo (native)' : 'tsc';
    log.info(`\nRunning type-check with ${compiler}...\n`);

    const failures: Array<{ project: string; error: string }> = [];

    for (const tsconfigPath of tsconfigPaths.sort()) {
      log.info(`Checking: ${tsconfigPath}`);
      try {
        if (useNative) {
          const tsgoPath = Path.resolve(REPO_ROOT, 'node_modules', '.bin', 'tsgo');
          execFileSync(tsgoPath, ['--project', tsconfigPath, '--noEmit'], {
            cwd: REPO_ROOT,
            stdio: 'inherit',
          });
        } else {
          execFileSync('node', ['scripts/type_check.js', '--project', tsconfigPath], {
            cwd: REPO_ROOT,
            stdio: 'inherit',
          });
        }
        log.success(`  passed: ${tsconfigPath}`);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        log.error(`  failed: ${tsconfigPath}`);
        failures.push({ project: tsconfigPath, error: errorMessage });
      }
    }

    // Step 7: Report results
    log.info('\n--- Results ---');
    log.info(`Total projects checked: ${tsconfigPaths.length}`);
    log.info(`Passed: ${tsconfigPaths.length - failures.length}`);
    log.info(`Failed: ${failures.length}`);

    if (failures.length > 0) {
      log.info('\nFailed projects:');
      for (const { project } of failures) {
        log.info(`  - ${project}`);
      }
      throw createFailError('Type-check failed for one or more projects.');
    }

    log.success('\nAll impacted projects passed type-checking!');
  },
  {
    description:
      'Find packages impacted by your changes (compared to main) and run type-checking on them.',
    flags: {
      string: ['base-ref', 'depth'],
      boolean: ['dry-run', 'native'],
      default: {
        'base-ref': 'main',
        'dry-run': false,
        native: false,
        depth: '1',
      },
      help: `
        --base-ref     The git ref to compare against (default: "main")
        --depth        How many levels of reverse dependencies to follow (default: 1)
                         1 = direct dependents only
                         2, 3, ... = transitive dependents up to N levels
                         0 = full transitive closure (unlimited)
        --dry-run      List impacted projects without running type-check
        --native       Use tsgo (TypeScript native/Go compiler) instead of tsc.
                         Requires @typescript/native-preview to be installed.
                         Note: tsgo is experimental and may not support all TypeScript features.
      `,
    },
  }
);
