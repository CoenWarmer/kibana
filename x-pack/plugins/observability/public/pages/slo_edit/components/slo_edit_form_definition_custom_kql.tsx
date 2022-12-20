/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonEmpty, EuiFlexGroup, EuiFlexItem, EuiFormLabel, EuiSuggest } from '@elastic/eui';
import React from 'react';
import { SliType } from './slo_edit_form';

export interface SloDefinitionFormProps {
  sliType: SliType;
}

const sampleItems = [
  {
    type: { iconType: 'save', color: 'tint3' },
    label: 'Saved search',
  },
];

export function SloEditFormDefinitionCustomKql() {
  const handleFieldBlur = () => {};
  const handleFieldFocus = () => {};
  const handleItemClick = () => {};
  const handleInputChange = () => {};

  return (
    <EuiFlexGroup direction="column" gutterSize="l">
      <EuiFlexItem>
        <EuiFormLabel>Index</EuiFormLabel>
        <EuiSuggest
          append={<EuiButtonEmpty>KQL</EuiButtonEmpty>}
          status={'unchanged'}
          aria-label="Filter"
          placeholder="The index to look into"
          suggestions={sampleItems}
          onBlur={handleFieldBlur}
          onFocus={handleFieldFocus}
          onItemClick={handleItemClick}
          onChange={handleInputChange}
        />
      </EuiFlexItem>

      <EuiFlexItem>
        <EuiFormLabel>Query filter</EuiFormLabel>
        <EuiSuggest
          append={<EuiButtonEmpty>KQL</EuiButtonEmpty>}
          status={'unchanged'}
          aria-label="Filter"
          placeholder="Custom filter to apply on the index"
          suggestions={sampleItems}
          onBlur={handleFieldBlur}
          onFocus={handleFieldFocus}
          onItemClick={handleItemClick}
          onChange={handleInputChange}
        />
      </EuiFlexItem>

      <EuiFlexItem>
        <EuiFormLabel>Good query</EuiFormLabel>
        <EuiSuggest
          append={<EuiButtonEmpty>KQL</EuiButtonEmpty>}
          status={'unchanged'}
          aria-label="Filter"
          placeholder="Define the good events"
          suggestions={sampleItems}
          onBlur={handleFieldBlur}
          onFocus={handleFieldFocus}
          onItemClick={handleItemClick}
          onChange={handleInputChange}
        />
      </EuiFlexItem>

      <EuiFlexItem>
        <EuiFormLabel>Total query</EuiFormLabel>
        <EuiSuggest
          append={<EuiButtonEmpty>KQL</EuiButtonEmpty>}
          status={'unchanged'}
          aria-label="Filter"
          placeholder="Define the total events"
          suggestions={sampleItems}
          onBlur={handleFieldBlur}
          onFocus={handleFieldFocus}
          onItemClick={handleItemClick}
          onChange={handleInputChange}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
