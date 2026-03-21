/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { REPO_ROOT } from '@kbn/repo-info';
import type { SomeDevLog } from '@kbn/some-dev-log';
import type { TsProject } from '@kbn/ts-projects';
import execa from 'execa';
import { MAX_COMMITS_TO_CHECK } from './constants';
import type { GcsFileSystem } from './file_system/gcs_file_system';
import {
  buildCandidateShaList,
  extractPrNumberFromCommitMessage,
  readMainBranchCommitShas,
  readRecentCommitShas,
  resolveCurrentCommitSha,
  resolveUpstreamRemote,
} from './utils';
import { isCacheServerAvailable } from './cache_server_client';
import { detectStaleArtifacts } from './detect_stale_artifacts';
import { buildReverseDependencyMap, computeEffectiveRebuildSet } from './dependency_graph';
import { getChangedInvalidationFiles } from './artifacts_state';

/**
 * A resolved GCS archive reference, from either commits/<sha>/ or prs/<prNumber>/.
 */
export interface BestGcsArchive {
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
export async function resolveGcsMatchedShas(
  log: SomeDevLog,
  gcsFs: GcsFileSystem,
  currentSha: string | undefined,
  history: string[],
  upstreamRemote: string | undefined,
  /** Pre-resolved cache server availability. When omitted (full-discovery / CI path),
   *  the check runs in parallel with the GCS listing inside this function. */
  knownCacheServerAvailable?: boolean
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

  const cacheServerAvailablePromise =
    knownCacheServerAvailable !== undefined
      ? Promise.resolve(knownCacheServerAvailable)
      : isCacheServerAvailable();

  const [{ shas: availableShas, elapsedMs }, , cacheServerAvailable] = await Promise.all([
    gcsFs.listAvailableCommitShas(),
    fetchUpstream,
    cacheServerAvailablePromise,
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
 * @param knownCacheServerAvailable Pre-resolved cache server availability so the
 *   check is not repeated inside resolveGcsMatchedShas.
 */
export async function resolveBestGcsSha(
  log: SomeDevLog,
  gcsFs: GcsFileSystem,
  knownCurrentSha?: string,
  knownCacheServerAvailable?: boolean
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
    upstreamRemote,
    knownCacheServerAvailable
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
export async function computeEffectiveRebuildCountFromSha(
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
export async function logArchiveFallback(
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
    ? `PR #${archive.prNumber} archive (${archive.sha.slice(0, 12)})`
    : `nearest ancestor (${archive.sha.slice(0, 12)})`;

  log.info(
    `[Cache check] No GCS archive for HEAD (${currentSha.slice(0, 12)}) — ` +
      `restoring from ${archiveLabel}${suffix}.`
  );
}

/**
 * Returns the best archive that is safe to restore given the current node_modules.
 * First checks the primary archive; if its yarn.lock (or other invalidation file)
 * differs from HEAD, falls back to `archive.fallbackCommitSha` when present.
 * Returns undefined if no safe archive can be found (both are invalidated or absent).
 */
export async function resolveNonInvalidatedArchive(
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
