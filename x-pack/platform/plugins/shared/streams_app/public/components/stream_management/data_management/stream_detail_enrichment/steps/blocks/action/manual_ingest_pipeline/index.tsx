/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSpacer } from '@elastic/eui';
import { JsonEditor } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/manual_ingest_pipeline/json_editor';
import { FieldsAccordion } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/optional_fields_accordion';
import { ProcessorConditionEditor } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/processor_condition_editor';
import { IgnoreFailureToggle } from '../../../../../../../data_management/stream_detail_enrichment/steps/blocks/action/ignore_toggles';

export const ManualIngestPipelineProcessorForm = () => {
  return (
    <>
      <JsonEditor />
      <EuiSpacer size="m" />
      <FieldsAccordion>
        <ProcessorConditionEditor />
      </FieldsAccordion>
      <EuiSpacer size="m" />
      <IgnoreFailureToggle />
    </>
  );
};
