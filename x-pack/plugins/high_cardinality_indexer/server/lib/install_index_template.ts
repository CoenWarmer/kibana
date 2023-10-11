/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { indexTemplates } from '../data_sources';
import { Config } from '../types';

export async function installIndexTemplate({
  client,
  config,
  logger,
}: {
  config: Config;
  logger: Logger;
  client: ElasticsearchClient;
}): Promise<void> {
  const namespace = config.indexing.dataset;
  const templates = indexTemplates[namespace];
  const templateNames = templates.map((templateDef) => templateDef.namespace).join(',');

  logger.info(`Installing index templates (${templateNames})`);

  try {
    for (const indexTemplateDef of templates) {
      const componentNames = indexTemplateDef.components.map(({ name }) => name);

      logger.info(`Installing components for ${indexTemplateDef.namespace} (${componentNames})`);

      for (const component of indexTemplateDef.components) {
        await client.cluster.putComponentTemplate({
          name: component.name,
          ...component.template,
        });
      }

      logger.info(`Installing index template (${indexTemplateDef.namespace})`);

      await client.indices.putIndexTemplate({
        name: indexTemplateDef.namespace,
        ...indexTemplateDef.template,
      });
    }
  } catch (error) {
    throw new Error(`Failed to install index template (${templateNames}): ${error.message}`);
  }
}
