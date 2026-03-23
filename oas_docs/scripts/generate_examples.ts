/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/* eslint-disable @kbn/imports/uniform_imports */

/**
 * Generates YAML example files.
 *
 * Invoked by the api-docs-overlay makefile target. To run manually from the Kibana root:
 *   cd oas_docs && npx tsx scripts/generate_examples.ts
 * or:
 *   make -C oas_docs generate-examples
 *
 * Output files land in oas_docs/examples/ and are referenced by
 * oas_docs/overlays/*.overlays.yaml via $ref.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { oasExamples as streamsOasExamples } from '../../x-pack/platform/plugins/shared/streams/docs/oas_examples';

const OUTPUT_DIR = path.resolve(__dirname, '../examples');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const exampleSets = [
  {
    outputDir: 'streams',
    examples: streamsOasExamples,
  },
];

for (const { outputDir, examples } of exampleSets) {
  const dir = path.resolve(OUTPUT_DIR, outputDir);
  fs.mkdirSync(dir, { recursive: true });

  for (const { filename, summary, value } of examples) {
    const content = yaml.dump({ summary, value }, { lineWidth: 120, noRefs: true });
    fs.writeFileSync(path.join(dir, filename), content, 'utf8');
  }
}
