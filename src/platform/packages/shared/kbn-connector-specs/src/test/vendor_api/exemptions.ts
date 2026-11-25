/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from '@kbn/zod/v4';

/**
 * Connector `metadata.id` to why it can't have a `vendor_api` folder, such as talking to a
 * database driver instead of an HTTP API.
 */
export const vendorApiExemptionsSchema = z.record(z.string().startsWith('.'), z.string().min(1));

export type VendorApiExemptions = z.infer<typeof vendorApiExemptionsSchema>;

/** The committed exemption list, beside this module. */
export const VENDOR_API_EXEMPTIONS_FILE = path.resolve(__dirname, 'vendor_api_exemptions.json');

/** Reads and validates the committed exemption list. */
export const readVendorApiExemptions = async (): Promise<VendorApiExemptions> =>
  vendorApiExemptionsSchema.parse(
    JSON.parse(await fs.readFile(VENDOR_API_EXEMPTIONS_FILE, 'utf8'))
  );

/** Whether a connector had `vendor_api` artifacts at the merge base, or didn't exist yet. */
export type CoverageAtBase = 'recorded' | 'unrecorded' | 'new';

export interface ConnectorCoverage {
  readonly id: string;
  readonly recorded: boolean;
  readonly exempt: boolean;
  readonly atBase: CoverageAtBase;
}

/**
 * The connectors whose vendor API coverage shrank since the merge base: recorded ones must stay
 * recorded, and new ones need artifacts unless they're exempt.
 */
export const findLostCoverage = (connectors: readonly ConnectorCoverage[]): ConnectorCoverage[] =>
  connectors.filter(
    ({ recorded, exempt, atBase }) =>
      !recorded && (atBase === 'recorded' || (atBase === 'new' && !exempt))
  );
