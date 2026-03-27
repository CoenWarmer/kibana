/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSpacer } from '@elastic/eui';
import { ProcessorFieldSelector } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/processor_field_selector';
import { FieldsAccordion } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/optional_fields_accordion';
import { IgnoreFailureToggle, IgnoreMissingToggle } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/ignore_toggles';
import { ConvertTypeSelector } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/convert/type_selector';
import { ProcessorConditionEditor } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/processor_condition_editor';
import { TargetFieldSelector } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/convert/target_field';

export const ConvertProcessorForm = () => {
  return (
    <>
      <ProcessorFieldSelector fieldKey="from" helpText="" />
      <ConvertTypeSelector />
      <EuiSpacer size="m" />
      <TargetFieldSelector />
      <EuiSpacer size="m" />
      <FieldsAccordion>
        <ProcessorConditionEditor />
      </FieldsAccordion>
      <EuiSpacer size="m" />
      <IgnoreFailureToggle />
      <IgnoreMissingToggle />
    </>
  );
};
