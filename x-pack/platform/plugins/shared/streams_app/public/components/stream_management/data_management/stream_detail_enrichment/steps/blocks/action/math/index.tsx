/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSpacer } from '@elastic/eui';
import { FieldsAccordion } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/optional_fields_accordion';
import { ProcessorConditionEditor } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/processor_condition_editor';
import { IgnoreFailureToggle, IgnoreMissingToggle } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/ignore_toggles';
import { MathExpressionEditor } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/math/math_expression_editor';
import { MathTargetFieldSelector } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/math/target_field';

export const MathProcessorForm = () => {
  return (
    <>
      <MathTargetFieldSelector />
      <EuiSpacer size="m" />
      <MathExpressionEditor />
      <EuiSpacer size="m" />
      <FieldsAccordion>
        <EuiSpacer size="m" />
        <ProcessorConditionEditor />
      </FieldsAccordion>
      <EuiSpacer size="m" />
      <IgnoreFailureToggle />
      <IgnoreMissingToggle />
    </>
  );
};
