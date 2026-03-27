/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { appendProcessorConfig } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/config_driven/configs/append';
import { renameProcessorConfig } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/config_driven/configs/rename';
import { removeByPrefixProcessorConfig } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/config_driven/configs/remove_by_prefix';
import { removeProcessorConfig } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/config_driven/configs/remove';

export const configDrivenProcessors = {
  rename: renameProcessorConfig,
  append: appendProcessorConfig,
  remove_by_prefix: removeByPrefixProcessorConfig,
  remove: removeProcessorConfig,
};
