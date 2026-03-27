/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSpacer } from '@elastic/eui';
import { GrokPatternsEditor } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/grok/grok_patterns_editor';
import { ProcessorFieldSelector } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/processor_field_selector';
import { FieldsAccordion } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/optional_fields_accordion';
import { ProcessorConditionEditor } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/processor_condition_editor';
import { IgnoreFailureToggle, IgnoreMissingToggle } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/ignore_toggles';
import { GrokPatternDefinition } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/grok/grok_pattern_definition';

export const GrokProcessorForm = () => {
  return (
    <>
      <ProcessorFieldSelector fieldKey="from" helpText="" />
      <GrokPatternsEditor />
      <EuiSpacer size="m" />
      <FieldsAccordion>
        <GrokPatternDefinition />
        <EuiSpacer size="m" />
        <ProcessorConditionEditor />
      </FieldsAccordion>
      <EuiSpacer size="m" />
      <IgnoreFailureToggle />
      <IgnoreMissingToggle />
    </>
  );
};
