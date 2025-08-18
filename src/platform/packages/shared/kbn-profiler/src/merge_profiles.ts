/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Fs from 'fs/promises';

interface CpuProfileNode {
  id: number; // id that increments, per profile
  callFrame: Record<string, unknown>;
  children?: number[];
  parent?: number;
  [extra: string]: unknown;
}

export interface CpuProfile {
  nodes: CpuProfileNode[];
  samples: number[]; // sequence of node ids
  timeDeltas: number[]; // microsecond deltas between samples (same length as samples)
  startTime?: number; // microsecond timestamp
  endTime?: number; // microsecond timestamp
  title?: string;
  [extra: string]: unknown;
}

interface MergedCpuProfile extends CpuProfile {
  startTime: number;
  endTime: number;
  title: string;
}

// --- Helpers -------------------------------------------------------------------------------------------------------

/** Reads and parses JSON profiles from disk. */
async function loadProfiles(filePaths: string[]): Promise<CpuProfile[]> {
  const profiles = await Promise.all(
    filePaths.map(async (path) => JSON.parse(await Fs.readFile(path, 'utf8')) as CpuProfile)
  );
  return profiles;
}

// increments the node ids from the next profile by the highest value
// for the previous profile, to make sure node ids are unique.
function remapAndCollectNodes(
  sourceNodes: CpuProfileNode[],
  nextNodeIdRef: { current: number },
  outNodes: CpuProfileNode[]
): Map<number, number> {
  const idMap = new Map<number, number>();

  for (const node of sourceNodes) {
    idMap.set(node.id, nextNodeIdRef.current++);
  }

  for (const node of sourceNodes) {
    const remapped: CpuProfileNode = { ...node, id: idMap.get(node.id)! };
    if (Array.isArray(node.children)) {
      remapped.children = node.children
        .map((cid) => idMap.get(cid))
        .filter((v): v is number => typeof v === 'number');
    }
    // Optionally remap parent if present (some emitters add this field)
    if ('parent' in remapped && typeof remapped.parent === 'number') {
      const mappedParent = idMap.get(remapped.parent);

      if (mappedParent === undefined) {
        delete remapped.parent;
      } else {
        remapped.parent = mappedParent;
      }
    }
    outNodes.push(remapped);
  }
  return idMap;
}

/**
 * Merge multiple raw sequential Chrome/V8 CPU profiles (the .cpuprofile JSON
 * format produced by --cpu-prof and Inpsector sessions) into one.
 *
 * Algorithm: sort by startTime, remap nodes, append samples; if gap: add to first delta.
 */
export async function mergeProfiles(profileName: string, filePaths: string[]): Promise<string> {
  if (!filePaths.length) {
    return JSON.stringify({
      nodes: [],
      samples: [],
      timeDeltas: [],
      startTime: 0,
      endTime: 0,
      title: profileName,
    });
  }
  const loadedProfiles = await loadProfiles(filePaths);

  const validProfiles = loadedProfiles.filter(
    (p) => p && Array.isArray(p.nodes) && Array.isArray(p.samples) && Array.isArray(p.timeDeltas)
  );

  // Sort profiles by startTime (missing startTime treated as 0)
  validProfiles.sort(
    (a, b) => (a.startTime ?? 0) - (b.startTime ?? 0) || (a.endTime ?? 0) - (b.endTime ?? 0)
  );

  const nextNodeIdRef = { current: 1 };
  const mergedNodes: CpuProfileNode[] = [];
  const mergedSamples: number[] = [];
  const mergedDeltas: number[] = [];

  const earliestStart = Math.min(
    ...validProfiles.flatMap((profile) =>
      profile.startTime !== undefined ? [profile.startTime] : []
    )
  );

  let lastEnd = earliestStart === Number.POSITIVE_INFINITY ? 0 : earliestStart;

  for (const profile of validProfiles) {
    const start = typeof profile.startTime === 'number' ? profile.startTime : lastEnd; // fallback to previous end
    const end =
      typeof profile.endTime === 'number'
        ? profile.endTime
        : start + profile.timeDeltas.reduce((a, b) => a + b, 0);

    const gap = start > lastEnd ? start - lastEnd : 0;

    const idMap = remapAndCollectNodes(profile.nodes, nextNodeIdRef, mergedNodes);

    // Append samples/deltas adjusting first delta for any gap
    for (let i = 0; i < profile.samples.length; i++) {
      const oldNodeId = profile.samples[i];
      const newNodeId = idMap.get(oldNodeId);

      if (newNodeId === undefined) {
        // orphaned node
        continue;
      }

      const originalDelta = profile.timeDeltas[i] ?? 0;

      if (mergedSamples.length === 0 && gap > 0 && i === 0) {
        // First profile and there is a gap before it (unlikely) -> just include gap in first delta
        mergedSamples.push(newNodeId);
        mergedDeltas.push(originalDelta + gap);
      } else if (i === 0 && gap > 0) {
        mergedSamples.push(newNodeId);
        mergedDeltas.push(originalDelta + gap);
      } else {
        mergedSamples.push(newNodeId);
        mergedDeltas.push(originalDelta);
      }
    }
    lastEnd = end;
  }

  const totalDuration = mergedDeltas.reduce((a, b) => a + b, 0);
  const startTime = earliestStart === Number.POSITIVE_INFINITY ? 0 : earliestStart;
  const endTime = startTime + totalDuration; // sequential, non-overlapping accumulation

  const merged: MergedCpuProfile = {
    nodes: mergedNodes,
    samples: mergedSamples,
    timeDeltas: mergedDeltas,
    startTime,
    endTime,
    title: profileName,
  };
  return JSON.stringify(merged);
}
