/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ElasticsearchClient,
  SavedObjectsClientContract,
  Logger,
  KibanaRequest,
} from '@kbn/core/server';
import { PackagePolicy } from '@kbn/fleet-plugin/common';
import { APMIndices } from '@kbn/apm-data-access-plugin/server';
import {
  APM_SERVER_SCHEMA_SAVED_OBJECT_TYPE,
  APM_SERVER_SCHEMA_SAVED_OBJECT_ID,
} from '../../../../../common/features/apm/apm_saved_object_constants';
import { APMPluginSetupDependencies, APMPluginStartDependencies } from '../../../../types';
import { getApmPackagePolicyDefinition } from './get_apm_package_policy_definition';
import { decoratePackagePolicyWithAgentConfigAndSourceMap } from './merge_package_policy_with_apm';
import { ELASTIC_CLOUD_APM_AGENT_POLICY_ID } from '../../../../../common/features/apm/fleet';
import { APMInternalESClient } from '../../lib/helpers/create_es_client/create_internal_es_client';

export async function createCloudApmPackgePolicy({
  cloudPluginSetup,
  fleetPluginStart,
  savedObjectsClient,
  esClient,
  logger,
  internalESClient,
  request,
  apmIndices,
}: {
  cloudPluginSetup: APMPluginSetupDependencies['cloud'];
  fleetPluginStart: NonNullable<APMPluginStartDependencies['fleet']>;
  savedObjectsClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  logger: Logger;
  internalESClient: APMInternalESClient;
  request: KibanaRequest;
  apmIndices: APMIndices;
}): Promise<PackagePolicy> {
  const { attributes } = await savedObjectsClient.get(
    APM_SERVER_SCHEMA_SAVED_OBJECT_TYPE,
    APM_SERVER_SCHEMA_SAVED_OBJECT_ID
  );
  const apmServerSchema: Record<string, any> = JSON.parse(
    (attributes as { schemaJson: string }).schemaJson
  );
  // Merges agent config and source maps with the new APM cloud package policy
  const apmPackagePolicyDefinition = await getApmPackagePolicyDefinition({
    apmServerSchema,
    cloudPluginSetup,
    fleetPluginStart,
    request,
  });
  const mergedAPMPackagePolicy = await decoratePackagePolicyWithAgentConfigAndSourceMap({
    internalESClient,
    packagePolicy: apmPackagePolicyDefinition,
    fleetPluginStart,
    apmIndices,
  });
  logger.info(`Fleet migration on Cloud - apmPackagePolicy create start`);
  const apmPackagePolicy = await fleetPluginStart.packagePolicyService.create(
    savedObjectsClient,
    esClient,
    mergedAPMPackagePolicy,
    { id: ELASTIC_CLOUD_APM_AGENT_POLICY_ID, force: true, bumpRevision: true }
  );
  logger.info(`Fleet migration on Cloud - apmPackagePolicy create end`);
  return apmPackagePolicy;
}
