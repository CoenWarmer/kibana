/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { InitialBenchConfig } from '@kbn/bench';

const config: InitialBenchConfig = {
  name: 'Babel Plugin Benchmark',
  benchmarks: [
    {
      kind: 'module',
      name: 'jest_unit_tests',
      module: require.resolve('./benchmarks/jest_unit.ts'),
      compare: {
        missing: 'lhs',
      },
    },
    // {
    //   kind: 'module',
    //   name: 'warm_start',
    //   module: require.resolve('./benchmarks/warm_start.bench.ts'),
    //   compare: {
    //     missing: 'lhs',
    //   },
    // },
  ],
  runs: 5,
  timeout: 10 * 60_000_000,
};

// eslint-disable-next-line import/no-default-export
export default config;
