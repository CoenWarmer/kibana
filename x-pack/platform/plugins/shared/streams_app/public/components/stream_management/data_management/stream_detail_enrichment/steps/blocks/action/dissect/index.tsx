/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSpacer } from '@elastic/eui';
import { DissectAppendSeparator } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/dissect/dissect_append_separator';
import { DissectPatternDefinition } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/dissect/dissect_pattern_definition';
import { ProcessorFieldSelector } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/processor_field_selector';
import { FieldsAccordion } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/optional_fields_accordion';
import { ProcessorConditionEditor } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/processor_condition_editor';
import { IgnoreFailureToggle, IgnoreMissingToggle } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/ignore_toggles';

export const DissectProcessorForm = () => {
  return (
    <>
      <ProcessorFieldSelector fieldKey="from" helpText="" />
      <DissectPatternDefinition />
      <EuiSpacer size="m" />
      <FieldsAccordion>
        <DissectAppendSeparator />
        <EuiSpacer size="m" />
        <ProcessorConditionEditor />
      </FieldsAccordion>
      <EuiSpacer size="m" />
      <IgnoreFailureToggle />
      <IgnoreMissingToggle />
    </>
  );
};
