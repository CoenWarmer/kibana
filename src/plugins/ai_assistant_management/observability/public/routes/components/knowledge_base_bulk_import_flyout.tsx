/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFilePicker,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiIcon,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { KnowledgeBaseEntry } from '../../../common/types';
import { useImportKnowledgeBaseEntries } from '../../hooks/use_import_knowledge_base_entries';

export function KnowledgeBaseBulkImportFlyout({ onClose }: { onClose: () => void }) {
  const { mutateAsync, isLoading } = useImportKnowledgeBaseEntries();

  const filePickerId = useGeneratedHtmlId({ prefix: 'filePicker' });

  const [files, setFiles] = useState<File[]>([]);

  const onChange = (file: FileList | null) => {
    setFiles(file && file.length > 0 ? Array.from(file) : []);
  };

  const handleSubmitNewEntryClick = async () => {
    let entries: Array<Omit<KnowledgeBaseEntry, '@timestamp'>> = [];
    // for (const file of files) {
    const text = await files[0].text();

    const elements = text.split('\n').filter(Boolean);

    try {
      entries = elements.map((el) => JSON.parse(el)) as Array<
        Omit<KnowledgeBaseEntry, '@timestamp'>
      >;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
    // }

    try {
      await mutateAsync({ entries });
      onClose();
    } catch (_) {
      /* empty */
    }
  };

  return (
    <EuiFlyout onClose={onClose}>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle>
          <h2>
            {i18n.translate(
              'aiAssistantManagementObservability.knowledgeBaseBulkImportFlyout.h2.bulkImportLabel',
              { defaultMessage: 'Import files' }
            )}
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <EuiFlexGroup alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiIcon type="addDataApp" size="xl" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate(
                  'aiAssistantManagementObservability.knowledgeBaseBulkImportFlyout.addFilesToEnrichTitleLabel',
                  { defaultMessage: 'Add files to enrich your Knowledge base' }
                )}
              </h3>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        <EuiText size="s">
          {i18n.translate(
            'aiAssistantManagementObservability.knowledgeBaseBulkImportFlyout.uploadAJSONFileTextLabel',
            {
              defaultMessage:
                'Upload a JSON file containing a list of entries to add to your Knowledge base.',
            }
          )}
        </EuiText>

        <EuiHorizontalRule />

        <EuiFilePicker
          aria-label={i18n.translate(
            'aiAssistantManagementObservability.knowledgeBaseBulkImportFlyout.euiFilePicker.uploadJSONLabel',
            { defaultMessage: 'Upload JSON' }
          )}
          display="large"
          fullWidth
          id={filePickerId}
          initialPromptText={i18n.translate(
            'aiAssistantManagementObservability.knowledgeBaseBulkImportFlyout.euiFilePicker.selectOrDragAndLabel',
            { defaultMessage: 'Select or drag and drop multiple files' }
          )}
          onChange={onChange}
        />
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty disabled={isLoading} onClick={onClose}>
              {i18n.translate(
                'aiAssistantManagementObservability.knowledgeBaseBulkImportFlyout.cancelButtonEmptyLabel',
                { defaultMessage: 'Cancel' }
              )}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton fill isLoading={isLoading} onClick={handleSubmitNewEntryClick}>
              {i18n.translate(
                'aiAssistantManagementObservability.knowledgeBaseBulkImportFlyout.saveButtonLabel',
                { defaultMessage: 'Save' }
              )}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
}
