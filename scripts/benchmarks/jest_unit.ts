/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { BenchmarkRunnable } from '@kbn/bench';
import execa from 'execa';
// Unit Jest benchmark doesn't require external services

// eslint-disable-next-line import/no-default-export
export default async (): Promise<BenchmarkRunnable> => {
  return {
    async beforeAll({ workspace, log }) {},
    async before({ workspace, log }) {},
    async run({ workspace }) {
      const start = Date.now();

      await execa(
        'node',
        [
          'scripts/jest',
          '--no-cache',
          '--config',
          'x-pack/platform/plugins/shared/streams/jest.config.js',
          '--runInBand',
        ],
        {
          cwd: workspace.getDir(),
          env: {
            KBN_BABEL_DUMP_FINAL: '0',
            KBN_BABEL_DEBUG: '0',
            DISABLE_BABEL_REGISTER_CACHE: '1',
          },
        }
      );
      const durationMs = Date.now() - start;
      return { metrics: { duration_ms: durationMs } };
    },
    async after({ log }) {},
  };
};
