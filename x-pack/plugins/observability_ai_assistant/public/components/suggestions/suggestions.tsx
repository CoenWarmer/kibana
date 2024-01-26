/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiPanel, EuiTitle, EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import { SuggestionButton } from './suggestion_button';
import type { Suggestion } from '../../../common/types';

export function Suggestions({
  suggestions,
  onSelect,
}: {
  suggestions: Suggestion[];
  onSelect: ({ prompt, type }: { prompt: string; type: 'select' | 'fill' }) => void;
}) {
  return (
    <EuiPanel hasBorder={false} hasShadow={false}>
      <EuiTitle size="s">
        <h2>
          {i18n.translate('xpack.observabilityAiAssistant.suggestions.getStartedTitleLabel', {
            defaultMessage: 'Get started',
          })}
        </h2>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiFlexGroup>
        <EuiFlexItem>
          {suggestions.map((suggestion) => (
            <SuggestionButton suggestion={suggestion} onSelect={onSelect} />
          ))}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}
