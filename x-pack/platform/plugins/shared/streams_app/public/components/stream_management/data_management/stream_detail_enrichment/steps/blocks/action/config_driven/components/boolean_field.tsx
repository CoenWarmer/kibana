/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ConfigDrivenProcessorFormState, FieldConfiguration } from '../../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/config_driven/types';
import { ToggleField } from '../../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/toggle_field';
import type { ExtractBooleanFields } from '../../../../../../../../data_management/stream_detail_enrichment/types';

export const BooleanField = ({
  fieldConfiguration,
}: {
  fieldConfiguration: FieldConfiguration;
}) => {
  const { field, label, helpText } = fieldConfiguration;
  return (
    <ToggleField
      name={field as ExtractBooleanFields<ConfigDrivenProcessorFormState>}
      label={label}
      helpText={helpText}
    />
  );
};
