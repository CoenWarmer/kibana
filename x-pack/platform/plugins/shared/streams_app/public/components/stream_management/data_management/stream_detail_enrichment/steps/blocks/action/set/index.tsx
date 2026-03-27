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
import { ProcessorConditionEditor } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/processor_condition_editor';
import { IgnoreFailureToggle } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/ignore_toggles';
import { IgnoreEmptyValueField, OverrideField } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/set/set_optional_fields';
import { SetValueOrCopyFromField } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/set/set_value_or_copy_from_field';

export const SetProcessorForm = () => {
  return (
    <>
      <ProcessorFieldSelector fieldKey="to" helpText="" />
      <SetValueOrCopyFromField />
      <EuiSpacer size="m" />
      <FieldsAccordion>
        <OverrideField />
        <IgnoreEmptyValueField />
        {/* MediaTypeField is intentionally omitted because Streamlang currently doesn't support Mustache templates.
          Media type is only applicable for template snippets (Mustache-rendered content).
          Re-enable <MediaTypeField /> if/when template snippet support is added. */}
        {/* <MediaTypeField />*/}
        <EuiSpacer size="m" />
        <ProcessorConditionEditor />
      </FieldsAccordion>
      <EuiSpacer size="m" />
      <IgnoreFailureToggle />
    </>
  );
};
