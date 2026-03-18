/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Path from 'path';
import { REPO_ROOT } from '@kbn/repo-info';
import type { SomeDevLog } from '@kbn/some-dev-log';
import type { TsProject } from '@kbn/ts-projects';
import execa from 'execa';
import { asyncForEachWithLimit } from '@kbn/std';
import {
  ARTIFACTS_STATE_FILE,
  CACHE_INVALIDATION_FILES,
  LOCAL_CACHE_ROOT,
  MAX_COMMITS_TO_CHECK,
} from './constants';
import { GcsFileSystem } from './file_system/gcs_file_system';
import { LocalFileSystem } from './file_system/local_file_system';
import {
  buildCandidateShaList,
  cleanTypeCheckArtifacts,
  extractPrNumberFromCommitMessage,
  getPullRequestNumber,
  isCiEnvironment,
  readMainBranchCommitShas,
  readRecentCommitShas,
  resolveCurrentCommitSha,
  resolveUpstreamRemote,
} from './utils';
import { detectStaleArtifacts } from './detect_stale_artifacts';
import { isCacheServerAvailable, tryRestoreFromCacheServer } from './cache_server_client';

const STALE_RESTORE_THRESHOLD = 10;

/**
 * Deletes the .tsbuildinfo file for each project in the given set of
 * tsconfig.type_check.json paths. This forces tsc to re-type-check those
 * projects on the next --build run even when their source file hashes still
 * match the stored .tsbuildinfo — which can happen when a historical
 * successful compilation is on disk but the code has since become invalid
 * (e.g. a dependency's re-exported API changed without the re-export file
 * itself changing).
 *
 * Only deletes the .tsbuildinfo; the compiled .d.ts outputs in target/types
 * are left intact so other projects can still reference them.
 */
async function invalidateTsBuildInfoFiles(
  projectPaths: Set<string>,
  log: SomeDevLog
): Promise<void> {
  let deleted = 0;

  await asyncForEachWithLimit([...projectPaths], 20, async (tsConfigPath) => {
    const projectDir = Path.dirname(tsConfigPath);
    const tsBuildInfoPath = Path.join(
      projectDir,
      'target',
      'types',
      'tsconfig.type_check.tsbuildinfo'
    );

    try {
      await Fs.promises.unlink(tsBuildInfoPath);
      deleted++;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.verbose(
          `[Cache] Could not delete ${tsBuildInfoPath}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  });

  if (deleted > 0) {
    log.verbose(
      `[Cache] Invalidated ${deleted} stale .tsbuildinfo file(s) to force tsc to recheck them.`
    );
  }
}

/**
 * Returns the subset of CACHE_INVALIDATION_FILES that changed between the
 * given commit SHA and HEAD. Used to detect whether local build artifacts
 * were created against different node_modules (e.g. after a yarn.lock update)
 * and therefore can no longer be trusted for incremental tsc correctness.
 */
async function getChangedInvalidationFiles(fromSha: string): Promise<string[]> {
  try {
    const { stdout } = await execa(
      'git',
      ['diff', '--name-only', fromSha, 'HEAD', '--', ...CACHE_INVALIDATION_FILES],
      { cwd: REPO_ROOT }
    );
    return stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

/**
 * Returns true if any cache-invalidation file changed between the given archive
 * and HEAD, meaning the archive was built against a different node_modules and
 * cannot be safely used as incremental tsc input.
 * Logs a warning when the check fires so the reason is visible to the user.
 */
async function archiveInvalidatedByNodeModulesChange(
  archive: BestGcsArchive,
  log: SomeDevLog
): Promise<boolean> {
  const changed = await getChangedInvalidationFiles(archive.sha);
  if (changed.length > 0) {
    const archiveLabel = archive.prNumber
      ? `${archive.sha.slice(0, 12)} (PR #${archive.prNumber})`
      : archive.sha.slice(0, 12);
    const fileList = changed.join(', ');
    const verb = changed.length === 1 ? 'is' : 'are';
    log.warning(
      `[Cache check] Closest available archive on GCP is ${archiveLabel}. ` +
        `However, ${fileList} ${verb} different, so the archive was built with a different node_modules folder. ` +
        `Archive is unreliable for HEAD — skipping restore of this archive.`
    );
    return true;
  }
  return false;
}

/**
 * Writes the given commit SHA to the per-clone state file, recording what
 * commit the local TypeScript build artifacts currently correspond to.
 * Called after a GCS restore and after each successful tsc run.
 */
export async function writeArtifactsState(sha: string): Promise<void> {
  await Fs.promises.mkdir(Path.dirname(ARTIFACTS_STATE_FILE), { recursive: true });
  await Fs.promises.writeFile(ARTIFACTS_STATE_FILE, sha, 'utf8');
}

/**
 * Returns the commit SHA the local artifacts currently correspond to, or
 * undefined if no state has been recorded yet (e.g. first run, or the file
 * was deleted alongside the artifacts).
 */
export async function readArtifactsState(): Promise<string | undefined> {
  try {
    const sha = (await Fs.promises.readFile(ARTIFACTS_STATE_FILE, 'utf8')).trim();
    return sha.length > 0 ? sha : undefined;
  } catch {
    return undefined;
  }
}

export type RestoreStrategy =
  | {
      shouldRestore: true;
      bestSha: string;
      staleProjects: string[];
      prNumber?: string;
      /** PR branch tip SHA; only set for PR archives. Passed to restoreArchive as
       *  the shas lookup key (must match metadata.json's commitSha). bestSha is the
       *  main-branch merge commit and is used for the state file and git operations. */
      prTipSha?: string;
    }
  | { shouldRestore: false; bestSha?: undefined };

/**
 * A resolved GCS archive reference, from either commits/<sha>/ or prs/<prNumber>/.
 */
interface BestGcsArchive {
  /** Canonical commit SHA for git operations, staleness detection, and the state file.
   *  Always present in the local git object store (fetched with upstream/main).
   *  For commit archives: the commit SHA itself.
   *  For PR archives: the upstream/main merge commit (same tree as the PR tip,
   *  since Kibana uses squash merges). */
  sha: string;
  /** PR number if the archive lives at prs/<prNumber>/ instead of commits/<sha>/. */
  prNumber?: string;
  /** PR branch tip SHA; only set for PR archives.
   *  Used as the shas lookup key in restoreArchive (metadata.json's commitSha).
   *  Not guaranteed to be present in the local git object store. */
  prTipSha?: string;
  /** Best commit archive to fall back to when this archive is invalidated by a
   *  node_modules change (i.e. yarn.lock differs between this archive and HEAD).
   *  Only set when this is a PR archive that supersedes an older commit archive. */
  fallbackCommitSha?: string;
}

/**
 * For each unmatched main commit, attempts to find a PR archive by parsing
 * the PR number from the commit message (Kibana squash-merges append "(#NNNN)")
 * and fetching prs/<prNumber>/metadata.json from GCS.
 *
 * This bridges the gap between a commit landing on upstream/main and its
 * on_merge CI job completing and uploading a commit archive. The PR archive
 * created during PR CI is available immediately and contains the same artifacts,
 * since Kibana uses squash merges whose final tree is identical to the PR tip.
 */
async function resolvePrFallbackMatches(
  log: SomeDevLog,
  gcsFs: GcsFileSystem,
  unmatchedMainShas: string[]
): Promise<BestGcsArchive[]> {
  log.verbose(
    `[Cache] Checking PR archives for ${unmatchedMainShas.length} recent main commit(s) without commit archives...`
  );

  const results = await Promise.all(
    unmatchedMainShas.map(async (mainSha): Promise<BestGcsArchive | undefined> => {
      const prNumber = await extractPrNumberFromCommitMessage(mainSha);
      if (!prNumber) return undefined;

      const tipSha = await gcsFs.getPrArchiveTipSha(prNumber);
      if (!tipSha) return undefined;

      log.verbose(
        `[Cache] PR archive found for main commit ${mainSha.slice(0, 12)} (PR #${prNumber})`
      );

      return { sha: mainSha, prNumber, prTipSha: tipSha };
    })
  );

  return results.filter((r): r is BestGcsArchive => r !== undefined);
}

/**
 * Fetches upstream, lists available GCS archive SHAs, and returns the subset
 * of local git candidates that have a matching archive — ordered most to least
 * recent. Shared by resolveBestGcsSha and the full-discovery restore path so
 * the matching logic stays in one place.
 */
async function resolveGcsMatchedShas(
  log: SomeDevLog,
  gcsFs: GcsFileSystem,
  currentSha: string | undefined,
  history: string[],
  upstreamRemote: string | undefined
): Promise<string[]> {
  const fetchUpstream = upstreamRemote
    ? execa('git', ['fetch', upstreamRemote, 'main', '--quiet'], { cwd: REPO_ROOT })
        .then(() => log.verbose(`Fetched latest main from ${upstreamRemote}.`))
        .catch((err: unknown) => {
          log.warning(
            `Failed to fetch ${upstreamRemote}/main: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        })
    : Promise.resolve();

  const [{ shas: availableShas, elapsedMs }, , cacheServerAvailable] = await Promise.all([
    gcsFs.listAvailableCommitShas(),
    fetchUpstream,
    isCacheServerAvailable(),
  ]);

  if (availableShas.size === 0) {
    log.warning('GCS returned 0 archives. The bucket may be temporarily unavailable.');
  } else {
    const listMsg = `Listed ${availableShas.size} available archive(s) from GCS via API (${elapsedMs}ms)`;

    if (cacheServerAvailable) {
      log.verbose(listMsg);
    } else {
      log.info(listMsg);
    }
  }

  const mainShas = upstreamRemote
    ? await readMainBranchCommitShas(MAX_COMMITS_TO_CHECK, upstreamRemote)
    : [];

  const candidates = buildCandidateShaList(currentSha, [...history, ...mainShas]);
  const matched = candidates.filter((sha) => availableShas.has(sha));

  if (matched.length === 0 && candidates.length > 0 && availableShas.size > 0) {
    log.info(
      `[Cache] None of the ${candidates.length} candidate commit(s) matched ` +
        `the ${availableShas.size} archived commit(s) in GCS.`
    );
  }

  return matched;
}

/**
 * Finds the best available GCS archive for the current checkout.
 * Prefers the most recent commit archive; falls back to PR archives for main
 * commits whose on_merge CI job hasn't completed yet.
 *
 * @param knownCurrentSha When provided, skips the `git rev-parse HEAD` call to
 *   avoid resolving the current SHA twice when the caller already has it.
 */
async function resolveBestGcsSha(
  log: SomeDevLog,
  gcsFs: GcsFileSystem,
  knownCurrentSha?: string
): Promise<BestGcsArchive | undefined> {
  const upstreamRemote = await resolveUpstreamRemote();
  const [currentSha, history] = await Promise.all([
    knownCurrentSha !== undefined ? Promise.resolve(knownCurrentSha) : resolveCurrentCommitSha(),
    readRecentCommitShas(MAX_COMMITS_TO_CHECK),
  ]);
  const commitMatched = await resolveGcsMatchedShas(
    log,
    gcsFs,
    currentSha,
    history,
    upstreamRemote
  );

  // For main commits that have no commit archive yet (on_merge CI still in
  // progress), check whether a PR archive exists. Use mainShas position (index
  // 0 = most recent on main) to determine recency — NOT candidates position,
  // because main commits that aren't local ancestors are appended after the
  // local history section in candidates, giving them artificially high indices.
  const mainShas = upstreamRemote
    ? await readMainBranchCommitShas(MAX_COMMITS_TO_CHECK, upstreamRemote)
    : [];

  // Find the position of the best commit match within upstream/main. If it is
  // not on main (e.g. a local commit), fall back to checking all main commits.
  const bestCommitMainIdx = commitMatched.length > 0 ? mainShas.indexOf(commitMatched[0]) : -1;

  // Slice the main commits that are more recent than the best commit match.
  // mainShas[0] is the most recent, so indices 0..bestCommitMainIdx-1 are newer.
  const candidateMainShas =
    bestCommitMainIdx >= 0 ? mainShas.slice(0, bestCommitMainIdx) : mainShas;

  const unmatchedMainBefore = candidateMainShas.filter((sha) => !commitMatched.includes(sha));

  if (unmatchedMainBefore.length > 0) {
    const prFallbacks = await resolvePrFallbackMatches(
      log,
      gcsFs,
      unmatchedMainBefore.slice(0, 10)
    );

    if (prFallbacks.length > 0) {
      // Pick the most recent PR match: smallest index in mainShas = most recent.
      const bestPr = prFallbacks.reduce((best, curr) =>
        mainShas.indexOf(curr.sha) < mainShas.indexOf(best.sha) ? curr : best
      );
      // Carry the best commit archive as a fallback in case the PR archive is
      // invalidated by a node_modules change (different yarn.lock than HEAD).
      return commitMatched.length > 0 ? { ...bestPr, fallbackCommitSha: commitMatched[0] } : bestPr;
    }
  }

  return commitMatched.length > 0 ? { sha: commitMatched[0] } : undefined;
}

/**
 * Computes the effective rebuild count — directly stale projects plus all their
 * transitive dependents — relative to the given archive SHA. Used to tell the
 * user how many projects tsc will still need to process after a GCS restore.
 * Returns undefined if the staleness check fails (e.g. SHA not in local history).
 */
async function computeEffectiveRebuildCountFromSha(
  archiveSha: string,
  tsProjects: TsProject[]
): Promise<number | undefined> {
  try {
    const stale = await detectStaleArtifacts({
      fromCommit: archiveSha,
      toCommit: 'HEAD',
      sourceConfigPaths: tsProjects.map((p) => p.path),
    });
    const reverseDeps = buildReverseDependencyMap(tsProjects);
    return computeEffectiveRebuildSet(stale, reverseDeps).size;
  } catch {
    return undefined;
  }
}

/**
 * Logs a notice when the best available GCS archive is not for HEAD, which
 * typically means CI hasn't published an archive for the current commit yet.
 * Includes how many commits separate HEAD from the archive and, when the
 * effective rebuild count is known, how many projects tsc will need to rebuild
 * after the restore.
 * Emitted at most once per restore decision — only when the SHAs differ.
 * For PR archives the message names the PR so the user knows where the archive came from.
 */
async function logArchiveFallback(
  log: SomeDevLog,
  currentSha: string | undefined,
  archive: BestGcsArchive,
  effectiveRebuildCount?: number
): Promise<void> {
  if (!currentSha || archive.sha === currentSha) {
    return;
  }

  const details: string[] = [];

  try {
    const { stdout } = await execa('git', ['rev-list', '--count', `${archive.sha}..HEAD`], {
      cwd: REPO_ROOT,
    });
    const count = parseInt(stdout.trim(), 10);
    if (!isNaN(count)) {
      details.push(`${count} commit${count === 1 ? '' : 's'} behind HEAD`);
    }
  } catch {
    // Non-fatal — omit the commit count if git fails.
  }

  if (effectiveRebuildCount !== undefined) {
    details.push(
      `${effectiveRebuildCount} project${effectiveRebuildCount === 1 ? '' : 's'} to rebuild`
    );
  }

  const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';

  const archiveLabel = archive.prNumber
    ? `PR #${archive.prNumber} archive for main commit (${archive.sha.slice(0, 12)})`
    : `nearest ancestor archive (${archive.sha.slice(0, 12)})`;

  log.info(
    `[Cache check] No archive for HEAD (${currentSha.slice(0, 12)}) available on GCP yet — ` +
      `using ${archiveLabel}${suffix}.`
  );
}

/**
 * Returns the best archive that is safe to restore given the current node_modules.
 * First checks the primary archive; if its yarn.lock (or other invalidation file)
 * differs from HEAD, falls back to `archive.fallbackCommitSha` when present.
 * Returns undefined if no safe archive can be found (both are invalidated or absent).
 */
async function resolveNonInvalidatedArchive(
  archive: BestGcsArchive,
  log: SomeDevLog
): Promise<BestGcsArchive | undefined> {
  if (!(await archiveInvalidatedByNodeModulesChange(archive, log))) {
    return archive;
  }
  if (archive.fallbackCommitSha) {
    const fallback: BestGcsArchive = { sha: archive.fallbackCommitSha };
    if (!(await archiveInvalidatedByNodeModulesChange(fallback, log))) {
      return fallback;
    }
  }
  return undefined;
}

/**
 * Determines whether TypeScript build artifacts should be restored from GCS
 * before running the type check.
 *
 * Uses a three-phase approach to avoid unnecessary GCS work:
 *
 * Phase 1 (fast, local-only): checks whether local artifacts exist and reads
 *   the state file that records what commit they correspond to. If artifacts
 *   are missing or their state is unknown, we immediately decide to restore.
 *
 * Phase 2 (git-based, still local): computes the effective rebuild set — stale
 *   projects plus all their transitive dependents via BFS. A foundational stale
 *   package can cascade into hundreds of dependent rebuilds, so raw stale count
 *   is a poor signal; effective rebuild count is the correct metric.
 *   If the count is within the threshold, no restore is needed.
 *
 * Phase 3 (GCS lookup + second git diff): only reached when the local effective
 *   rebuild count exceeds the threshold. Finds the best available GCS archive
 *   SHA, then runs a second git diff from that SHA to HEAD to compute how many
 *   projects would still be stale after a restore. The restore only happens if
 *   the GCS archive genuinely reduces the rebuild count — this avoids a wasteful
 *   ~2 min download when the user intentionally changed a foundational package
 *   and the GCS archive is just as stale.
 */
export async function resolveRestoreStrategy(
  log: SomeDevLog,
  tsProjects: TsProject[]
): Promise<RestoreStrategy> {
  const gcsFs = new GcsFileSystem(log);

  // Phase 1: fast local checks — no network I/O.
  const [hasLocalArtifacts, localStateSha, currentSha] = await Promise.all([
    checkForExistingBuildArtifacts(),
    readArtifactsState(),
    resolveCurrentCommitSha(),
  ]);

  if (!hasLocalArtifacts) {
    log.info('[Cache check] No local artifacts found — will restore from cache.');

    const bestArchive = await resolveBestGcsSha(log, gcsFs, currentSha);

    if (!bestArchive) {
      log.info('[Cache check] No GCS archive available — tsc will build from scratch.');
      return { shouldRestore: false };
    }

    const validArchive = await resolveNonInvalidatedArchive(bestArchive, log);
    if (!validArchive) {
      return { shouldRestore: false };
    }

    const effectiveRebuildCount = await computeEffectiveRebuildCountFromSha(
      validArchive.sha,
      tsProjects
    );
    await logArchiveFallback(log, currentSha, validArchive, effectiveRebuildCount);
    return {
      shouldRestore: true,
      bestSha: validArchive.sha,
      prNumber: validArchive.prNumber,
      prTipSha: validArchive.prTipSha,
      staleProjects: [],
    };
  }

  if (!localStateSha) {
    // Local artifacts exist but we have no record of what commit they correspond to
    // (e.g. first run after adding this tool, or state file was deleted). Treat
    // as unknown freshness and restore from GCS so we start from a known baseline.
    log.info('[Cache check] Local artifact state unknown — will restore from cache.');

    const bestArchive = await resolveBestGcsSha(log, gcsFs, currentSha);

    if (!bestArchive) {
      log.info('[Cache check] No GCS archive available — tsc will handle staleness incrementally.');
      return { shouldRestore: false };
    }

    const validArchive = await resolveNonInvalidatedArchive(bestArchive, log);
    if (!validArchive) {
      return { shouldRestore: false };
    }

    const effectiveRebuildCount = await computeEffectiveRebuildCountFromSha(
      validArchive.sha,
      tsProjects
    );
    await logArchiveFallback(log, currentSha, validArchive, effectiveRebuildCount);
    return {
      shouldRestore: true,
      bestSha: validArchive.sha,
      prNumber: validArchive.prNumber,
      prTipSha: validArchive.prTipSha,
      staleProjects: [],
    };
  }

  // Phase 1.5: cache-invalidation file check — git diff, no network I/O.
  // Changes to yarn.lock, .nvmrc, or .node-version mean node_modules may have
  // changed since the local artifacts were built. tsc's .tsbuildinfo incremental
  // check compares the hashes of dependency .d.ts outputs in target/types — if
  // those outputs are still from the old node_modules version, tsc considers
  // downstream projects "up-to-date" without rechecking them, silently masking
  // type errors (e.g. Zod v3 → v4 API incompatibilities).
  // When invalidation files changed, wipe the local artifacts, then check if GCS
  // has an archive built *after* the invalidating change (which would be safe to
  // restore). If not, tsc rebuilds everything from scratch.
  const changedInvalidationFiles = await getChangedInvalidationFiles(localStateSha);
  if (changedInvalidationFiles.length > 0) {
    log.warning(
      `[Cache check] Cache-invalidation file(s) changed since ${localStateSha.slice(0, 12)}: ` +
        `${changedInvalidationFiles.join(', ')}. ` +
        `Local artifacts may be stale — cleaning them.`
    );
    await cleanTypeCheckArtifacts(log);
    await writeArtifactsState('');

    const bestArchive = await resolveBestGcsSha(log, gcsFs, currentSha);

    if (!bestArchive) {
      log.info('[Cache check] No GCS archive available — tsc will build from scratch.');
      return { shouldRestore: false };
    }

    const validArchive = await resolveNonInvalidatedArchive(bestArchive, log);
    if (!validArchive) {
      log.info('[Cache check] GCS archive also predates the change — tsc will build from scratch.');
      return { shouldRestore: false };
    }

    const effectiveRebuildCount = await computeEffectiveRebuildCountFromSha(
      validArchive.sha,
      tsProjects
    );
    await logArchiveFallback(log, currentSha, validArchive, effectiveRebuildCount);
    log.info(
      `[Cache check] Found compatible GCS archive at ${validArchive.sha.slice(
        0,
        12
      )} — will restore.`
    );
    return {
      shouldRestore: true,
      bestSha: validArchive.sha,
      prNumber: validArchive.prNumber,
      prTipSha: validArchive.prTipSha,
      staleProjects: [],
    };
  }

  // Phase 2: staleness check — git diff, no network I/O.
  // Staleness is computed from the local state SHA (what the artifacts on disk
  // actually correspond to) — NOT the GCS ancestor. Using the GCS ancestor would
  // undercount stale projects when local artifacts are older than the GCS archive.
  const stale = await detectStaleArtifacts({
    fromCommit: localStateSha,
    toCommit: 'HEAD',
    sourceConfigPaths: tsProjects.map((p) => p.path),
  });

  if (stale.size === 0) {
    log.info(
      `[Cache check] ✓ All artifacts are up-to-date — no committed changes since ${localStateSha.slice(
        0,
        12
      )}.`
    );

    return { shouldRestore: false, bestSha: undefined };
  }

  const reverseDeps = buildReverseDependencyMap(tsProjects);
  const effectiveRebuildSet = computeEffectiveRebuildSet(stale, reverseDeps);
  const shortSha = localStateSha.slice(0, 12);

  log.info(
    `[Cache check] ${stale.size} stale project(s) affect ${effectiveRebuildSet.size} project(s) ` +
      `in total (including dependents) since ${shortSha}.`
  );

  if (effectiveRebuildSet.size <= STALE_RESTORE_THRESHOLD) {
    log.info(
      `[Cache check] ✓ Cache freshness is good${
        effectiveRebuildSet.size === 1
          ? ' — only one project needs rebuilding'
          : effectiveRebuildSet.size > 1
          ? ' — only ${effectiveRebuildSet.size} projects need rechecking'
          : ' — no projects need rechecking'
      }`
    );
    // Invalidate .tsbuildinfo for stale projects so tsc is forced to recheck
    // them. Without this, tsc may treat a project as "up-to-date" if its source
    // file hashes match a historical successful build, even when the code is
    // now invalid (e.g. a dependency's API changed in the same zod package version).
    await invalidateTsBuildInfoFiles(effectiveRebuildSet, log);
    return { shouldRestore: false, bestSha: undefined };
  }

  // Phase 3: check whether a GCS restore would actually reduce the rebuild count.
  const bestGcsArchive = await resolveBestGcsSha(log, gcsFs, currentSha);

  if (!bestGcsArchive) {
    log.info(
      `[Cache check] No GCS archive found — proceeding with ${effectiveRebuildSet.size} local rebuilds.`
    );
    await invalidateTsBuildInfoFiles(effectiveRebuildSet, log);
    return { shouldRestore: false };
  }

  // Discard the archive if it was built against a different node_modules.
  // If the top pick is a PR archive with a newer yarn.lock, fall back to the
  // best commit archive (which shares the same yarn.lock as HEAD).
  const validGcsArchive = await resolveNonInvalidatedArchive(bestGcsArchive, log);

  if (!validGcsArchive) {
    log.info('[Cache check] Skipping restore — tsc will rebuild locally with current artifacts.');
    await invalidateTsBuildInfoFiles(effectiveRebuildSet, log);
    return { shouldRestore: false };
  }

  // Second git diff: how many projects are stale relative to the GCS archive SHA?
  // This is a cheap local operation — no download involved.
  let gcsEffectiveCount: number;

  try {
    const gcsStale = await detectStaleArtifacts({
      fromCommit: validGcsArchive.sha,
      toCommit: 'HEAD',
      sourceConfigPaths: tsProjects.map((p) => p.path),
    });

    gcsEffectiveCount = computeEffectiveRebuildSet(gcsStale, reverseDeps).size;
  } catch {
    // If the GCS SHA is not in local git history we can't compare; assume the
    // restore is beneficial and proceed.
    gcsEffectiveCount = 0;
  }

  if (gcsEffectiveCount < effectiveRebuildSet.size) {
    await logArchiveFallback(log, currentSha, validGcsArchive, gcsEffectiveCount);
    log.info(
      `[Cache check] Having archive for ${validGcsArchive.sha.slice(
        0,
        12
      )} would reduce rebuild count ` +
        `from ${effectiveRebuildSet.size} to ${gcsEffectiveCount} — will restore.`
    );

    const staleProjects = validGcsArchive.prNumber
      ? [] // cache server indexes by commit SHA — skip selective restore for PR archives
      : toServerProjectPaths([...effectiveRebuildSet]);

    return {
      shouldRestore: true,
      bestSha: validGcsArchive.sha,
      prNumber: validGcsArchive.prNumber,
      prTipSha: validGcsArchive.prTipSha,
      staleProjects,
    };
  }

  log.info(
    `[Cache check] ✓ GCS archive (${validGcsArchive.sha.slice(
      0,
      12
    )}) would not reduce the rebuild ` +
      `count (${gcsEffectiveCount} vs ${effectiveRebuildSet.size} locally) — skipping restore.`
  );

  // GCS restore would not help, but we still need to ensure tsc rechecks the
  // stale projects. Invalidate their .tsbuildinfo files so tsc cannot treat
  // them as up-to-date based on a historical (possibly incorrect) build.
  await invalidateTsBuildInfoFiles(effectiveRebuildSet, log);

  return { shouldRestore: false, bestSha: undefined };
}

/** Maps each project's typeCheckConfigPath to the set of its direct dependency typeCheckConfigPaths. */
export function buildForwardDependencyMap(tsProjects: TsProject[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const p of tsProjects) {
    map.set(
      p.typeCheckConfigPath,
      new Set(p.getKbnRefs(tsProjects).map((dep) => dep.typeCheckConfigPath))
    );
  }
  return map;
}

export function buildReverseDependencyMap(tsProjects: TsProject[]): Map<string, Set<string>> {
  const reverseDeps = new Map<string, Set<string>>();

  for (const project of tsProjects) {
    for (const dep of project.getKbnRefs(tsProjects)) {
      const depPath = dep.typeCheckConfigPath;

      if (!reverseDeps.has(depPath)) {
        reverseDeps.set(depPath, new Set());
      }

      reverseDeps.get(depPath)!.add(project.typeCheckConfigPath);
    }
  }

  return reverseDeps;
}

/**
 * Converts absolute tsconfig.type_check.json paths (as produced by detectStaleArtifacts /
 * computeEffectiveRebuildSet) to the relative tsconfig.json paths that the cache server
 * stores in its index. E.g.:
 *   /abs/path/kibana/packages/foo/tsconfig.type_check.json → packages/foo/tsconfig.json
 */
function toServerProjectPaths(absoluteTypeCheckPaths: string[]): string[] {
  return absoluteTypeCheckPaths.map((absPath) => {
    const rel = Path.relative(REPO_ROOT, absPath);

    return rel.replace(/tsconfig\.type_check\.json$/, 'tsconfig.json');
  });
}

/**
 * Computes the union of directly stale projects and all their transitive
 * dependents via BFS over the reverse dependency graph. This is the true
 * number of projects tsc would need to recheck if the stale artifacts are
 * used as-is.
 */
export function computeEffectiveRebuildSet(
  stale: Set<string>,
  reverseDeps: Map<string, Set<string>>
): Set<string> {
  const result = new Set(stale);
  const queue = [...stale];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const dependent of reverseDeps.get(current) ?? []) {
      if (!result.has(dependent)) {
        result.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return result;
}

/**
 * Restores TypeScript build artifacts from GCS (or local cache as fallback).
 *
 * @param specificSha When provided (local smart restore path), skips discovery
 *   and extracts the archive for that exact SHA directly. When omitted (CI path
 *   or --restore-artifacts), runs a full candidate search to find the best match.
 * @param options.skipExistingArtifactsCheck When true, do not short-circuit on
 *   existing target/types (use for explicit --restore-artifacts so a partially
 *   warm cache does not turn the restore into a no-op).
 */
export async function restoreTSBuildArtifacts(
  log: SomeDevLog,
  specificSha?: string,
  options: {
    skipExistingArtifactsCheck?: boolean;
    staleProjects?: string[];
    /** When set, restore from prs/<prNumber>/ instead of commits/<sha>/. */
    prNumber?: string;
    /** PR branch tip SHA used as the shas lookup key in restoreArchive.
     *  Only set when prNumber is also set. specificSha (the main-branch merge commit)
     *  is still used for the state file — it is guaranteed to be in local git. */
    prTipSha?: string;
  } = {}
) {
  try {
    if (specificSha) {
      // Direct restore — SHA already determined by resolveRestoreStrategy.
      // Skip cache server for PR archives: the server indexes by commit SHA and
      // would not have PR archives. Fall through to GCS directly.
      log.info(`[Cache] Restoring artifacts (${specificSha.slice(0, 12)})...`);

      const fromServer = options.prNumber
        ? false
        : await tryRestoreFromCacheServer(log, specificSha, options.staleProjects);

      if (fromServer) {
        await writeArtifactsState(specificSha);

        return;
      }

      const gcsFs = new GcsFileSystem(log);

      await gcsFs.restoreArchive({
        shas: [options.prTipSha ?? specificSha],
        prNumber: options.prNumber,
        skipExistenceCheck: true,
      });

      await writeArtifactsState(specificSha);

      return;
    }

    // Full discovery path: used by --restore-artifacts and CI.
    log.info('[Cache] Restoring artifacts...');

    // Skip if artifacts already exist locally (only when not explicitly
    // pre-populating: --restore-artifacts passes skipExistingArtifactsCheck so
    // a single prior --project run does not turn restore into a no-op).
    if (!isCiEnvironment() && !options.skipExistingArtifactsCheck) {
      const hasExistingArtifacts = await checkForExistingBuildArtifacts();

      if (hasExistingArtifacts) {
        log.info(
          '[Cache] Found existing artifacts — skipping restore (tsc incremental build will handle staleness).'
        );
        return;
      }
    }

    const [currentSha, history, upstreamRemote] = await Promise.all([
      resolveCurrentCommitSha(),
      readRecentCommitShas(MAX_COMMITS_TO_CHECK),
      resolveUpstreamRemote(),
    ]);

    const candidateShas = buildCandidateShaList(currentSha, history);

    if (candidateShas.length === 0) {
      log.info('[Cache] No commit history available for cache restore.');
      return;
    }

    const prNumber = getPullRequestNumber();

    const restoreOptions = {
      shas: candidateShas,
      prNumber,
      cacheInvalidationFiles: CACHE_INVALIDATION_FILES,
    };

    if (isCiEnvironment()) {
      await new GcsFileSystem(log).restoreArchive(restoreOptions);

      return;
    }

    // Local: try GCS first, fall back to local cache.
    try {
      const gcsFs = new GcsFileSystem(log);

      if (!upstreamRemote) {
        log.warning(
          'Could not find a git remote for elastic/kibana. ' +
            'Add one with: git remote add upstream git@github.com:elastic/kibana.git'
        );
      }

      const matchedShas = await resolveGcsMatchedShas(
        log,
        gcsFs,
        currentSha,
        history,
        upstreamRemote
      );

      if (matchedShas.length > 0) {
        const bestMatch = matchedShas[0];

        if (currentSha && bestMatch !== currentSha) {
          log.warning(
            `No CI artifacts available yet for HEAD (${currentSha.slice(0, 12)}). ` +
              `Falling back to the nearest ancestor with a cached archive (${bestMatch.slice(
                0,
                12
              )}).`
          );
        }

        log.info(
          `[Cache] Found ${
            matchedShas.length
          } matching archive(s) in GCS, restoring best match (${bestMatch.slice(0, 12)})...`
        );

        const fromServer = await tryRestoreFromCacheServer(log, bestMatch);

        if (fromServer) {
          await writeArtifactsState(bestMatch);

          return;
        }

        const restored = await gcsFs.restoreArchive({
          ...restoreOptions,
          cacheInvalidationFiles: undefined,
          shas: matchedShas,
          skipExistenceCheck: true,
          skipClean: true,
        });

        if (restored) {
          await writeArtifactsState(restored);

          return;
        }
      }

      log.info('[Cache] Falling back to local cache.');
    } catch (gcsError) {
      const gcsErrorDetails = gcsError instanceof Error ? gcsError.message : String(gcsError);
      log.warning(`[Cache] GCS restore failed (${gcsErrorDetails}), falling back to local cache.`);
    }

    try {
      await Fs.promises.access(LOCAL_CACHE_ROOT);
    } catch {
      log.info('[Cache] No local cache exists yet — it will be populated after this type check.');
      return;
    }

    const restored = await new LocalFileSystem(log).restoreArchive({
      ...restoreOptions,
      cacheInvalidationFiles: undefined,
      skipClean: true,
    });

    if (restored) {
      await writeArtifactsState(restored);
    }
  } catch (error) {
    const restoreErrorDetails = error instanceof Error ? error.message : String(error);
    log.warning(`[Cache] Failed to restore artifacts: ${restoreErrorDetails}`);
  }
}

/**
 * Spot-checks a sample of known TS project paths for existing `target/types`
 * directories. Uses the static `config-paths.json` (which lists every
 * tsconfig.json in the repo) instead of a filesystem glob — this avoids
 * scanning `node_modules` and is effectively instant.
 */
export async function checkForExistingBuildArtifacts(): Promise<boolean> {
  const configPathsFile = Path.resolve(REPO_ROOT, 'packages/kbn-ts-projects/config-paths.json');
  const raw = await Fs.promises.readFile(configPathsFile, 'utf8');
  const tsconfigPaths: string[] = JSON.parse(raw);

  const SAMPLE_SIZE = 30;
  const step = Math.max(1, Math.floor(tsconfigPaths.length / SAMPLE_SIZE));
  const sample = tsconfigPaths.filter((_, i) => i % step === 0).slice(0, SAMPLE_SIZE);

  const checks = sample.map(async (tsconfigRel) => {
    const projectDir = Path.dirname(Path.resolve(REPO_ROOT, tsconfigRel));
    try {
      await Fs.promises.access(Path.join(projectDir, 'target', 'types'));
      return true;
    } catch {
      return false;
    }
  });

  // `some(Boolean)` is intentionally conservative: a single sampled project
  // having a target/types directory is enough to conclude artifacts exist. This
  // can produce a false positive if the developer previously ran only a partial
  // type check, but Phase 2's state-SHA comparison corrects for that — if the
  // sampled project's artifacts are from a different commit, the effective
  // rebuild count will reflect that and trigger a fresh GCS restore if needed.
  return (await Promise.all(checks)).some(Boolean);
}
