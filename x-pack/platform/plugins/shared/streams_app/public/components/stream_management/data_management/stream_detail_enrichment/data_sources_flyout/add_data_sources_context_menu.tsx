/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButton, EuiContextMenu, EuiPopover } from '@elastic/eui';
import { useBoolean } from '@kbn/react-hooks';
import { DATA_SOURCES_I18N } from '../../../../../data_management/stream_detail_enrichment/data_sources_flyout/translations';
import {
  createDefaultCustomSamplesDataSource,
  defaultKqlSamplesDataSource,
} from '../../../../../data_management/stream_detail_enrichment/state_management/stream_enrichment_state_machine/utils';
import {
  useStreamEnrichmentEvents,
  useStreamEnrichmentSelector,
} from '../../../../../data_management/stream_detail_enrichment/state_management/stream_enrichment_state_machine';

export const AddDataSourcesContextMenu = () => {
  const { addDataSource } = useStreamEnrichmentEvents();
  const streamName = useStreamEnrichmentSelector((state) => state.context.definition.stream.name);
  const [isOpen, { toggle: toggleMenu, off: closeMenu }] = useBoolean();

  const menuItems = [
    {
      name: DATA_SOURCES_I18N.contextMenu.addKqlDataSource,
      icon: 'search',
      'data-test-subj': 'streamsAppProcessingAddKqlDataSource',
      onClick: () => {
        addDataSource(defaultKqlSamplesDataSource);
        closeMenu();
      },
    },
    {
      name: DATA_SOURCES_I18N.contextMenu.addCustomSamples,
      icon: 'visText',
      'data-test-subj': 'streamsAppProcessingAddCustomDataSource',
      onClick: () => {
        addDataSource(createDefaultCustomSamplesDataSource(streamName));
        closeMenu();
      },
    },
  ];

  return (
    <EuiPopover
      data-test-subj="streamsAppProcessingAddDataSourcesContextMenu"
      id="data-sources-menu"
      button={
        <EuiButton size="s" iconType="arrowDown" iconSide="right" onClick={toggleMenu}>
          {DATA_SOURCES_I18N.contextMenu.addDataSource}
        </EuiButton>
      }
      isOpen={isOpen}
      closePopover={closeMenu}
      panelPaddingSize="none"
      anchorPosition="downLeft"
    >
      <EuiContextMenu
        initialPanelId="data-source-options"
        panels={[
          {
            id: 'data-source-options',
            items: menuItems,
          },
        ]}
      />
    </EuiPopover>
  );
};
