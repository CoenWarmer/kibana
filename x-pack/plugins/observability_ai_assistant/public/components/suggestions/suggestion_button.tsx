/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiPanel } from '@elastic/eui';
import type { Suggestion } from '../../../common/types';

export function SuggestionButton({
  suggestion,
  onSelect,
}: {
  suggestion: Suggestion;
  onSelect: ({ prompt, type }: { prompt: string; type: 'select' | 'fill' }) => void;
}) {
  const handleSelect = () => onSelect({ prompt: suggestion.prompt, type: 'select' });
  const handleFill = () => onSelect({ prompt: suggestion.prompt, type: 'fill' });
  return (
    <EuiPanel hasBorder hasShadow={false} onClick={handleSelect}>
      <EuiFlexGroup>
        <EuiFlexItem grow>{suggestion.prompt}</EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            data-test-subj="observabilityAiAssistantSuggestionButtonButton"
            iconType="listAdd"
            aria-label={i18n.translate(
              'xpack.observabilityAiAssistant.suggestionButton.euiButtonIcon.fillLabel',
              { defaultMessage: 'fill' }
            )}
            onClick={handleFill}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}
