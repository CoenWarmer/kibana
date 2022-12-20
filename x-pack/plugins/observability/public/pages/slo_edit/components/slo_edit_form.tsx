/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiAvatar,
  EuiButton,
  EuiFormLabel,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiTimeline,
  EuiTimelineItem,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { euiThemeVars } from '@kbn/ui-theme';
import React, { ChangeEvent, useState } from 'react';

import { useKibana } from '../../../utils/kibana_react';
import { useCreateSlo } from '../../../hooks/slo/use_create_slo';
import { SloEditFormDefinitionCustomKql } from './slo_edit_form_definition_custom_kql';
import { SloEditFormDescription } from './slo_edit_form_description';
import { SloEditFormObjectives } from './slo_edit_form_objectives';
import { SLO } from '../../../typings';

export interface SloEditFormProps {
  slo: SLO | undefined;
}

export type SliType =
  | 'sli.apm.transaction_error_rate'
  | 'sli.apm.transaction_duration'
  | 'sli.kql.custom';

const SLI_OPTIONS: Array<{ value: SliType; text: string }> = [
  { value: 'sli.kql.custom', text: 'KQL custom indicator' },
];

export function SloEditForm({ slo }: SloEditFormProps) {
  const {
    notifications: { toasts },
  } = useKibana().services;

  const [stateSlo, setStateSlo] = useState<SLO | undefined>(slo);

  const { loading, error, createSlo } = useCreateSlo();

  const [sliType, setSliType] = useState<SliType>(SLI_OPTIONS[0].value);
  const sliSelectId = useGeneratedHtmlId({ prefix: 'sliSelect' });

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSliType(e.target.value as SliType);
  };

  const handleCreateSlo = () => {
    if (stateSlo) {
      createSlo(stateSlo);
    }
  };

  if (error) {
    toasts.addError(new Error(error), { title: 'Something went wrong' });
  }

  return (
    <EuiTimeline>
      <EuiTimelineItem
        verticalAlign="top"
        icon={<EuiAvatar name="Checked" iconType="check" color={euiThemeVars.euiColorSuccess} />}
      >
        <EuiPanel hasBorder={false} hasShadow={false} paddingSize="none">
          <EuiTitle>
            <h2>Define SLI</h2>
          </EuiTitle>

          <EuiSpacer size="xl" />

          <EuiFormLabel>SLI type</EuiFormLabel>
          <EuiSelect
            id={sliSelectId}
            options={SLI_OPTIONS}
            value={sliType}
            onChange={handleChange}
          />

          <EuiSpacer size="xl" />

          {sliType === 'sli.kql.custom' ? <SloEditFormDefinitionCustomKql /> : null}

          <EuiSpacer size="m" />
        </EuiPanel>
      </EuiTimelineItem>

      <EuiTimelineItem
        verticalAlign="top"
        icon={<EuiAvatar name="Checked" iconType="check" color={euiThemeVars.euiColorSuccess} />}
      >
        <EuiPanel hasBorder={false} hasShadow={false} paddingSize="none">
          <EuiTitle>
            <h2>Set objectives</h2>
          </EuiTitle>

          <EuiSpacer size="xl" />

          <SloEditFormObjectives />

          <EuiSpacer size="xl" />
        </EuiPanel>
      </EuiTimelineItem>

      <EuiTimelineItem
        verticalAlign="top"
        icon={<EuiAvatar name="Checked" iconType="check" color={euiThemeVars.euiColorSuccess} />}
      >
        <EuiPanel hasBorder={false} hasShadow={false} paddingSize="none">
          <EuiTitle>
            <h2>Describe SLO</h2>
          </EuiTitle>

          <EuiSpacer size="xl" />

          <SloEditFormDescription />

          <EuiSpacer size="xl" />

          <EuiButton color="primary" onClick={handleCreateSlo} isLoading={loading && !error}>
            Create SLO
          </EuiButton>
        </EuiPanel>
      </EuiTimelineItem>
    </EuiTimeline>
  );
}
