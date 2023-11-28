/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { IHttpFetchError, ResponseErrorBody } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import type { KnowledgeBaseEntry } from '@kbn/observability-ai-assistant-plugin/common/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '../context/app_context';
import { REACT_QUERY_KEYS } from '../constants';

type ServerError = IHttpFetchError<ResponseErrorBody>;

export function useImportKnowledgeBaseEntries() {
  const {
    observabilityAIAssistant,
    notifications: { toasts },
  } = useAppContext();
  const queryClient = useQueryClient();
  const observabilityAIAssistantApi = observabilityAIAssistant?.callApi;

  return useMutation<
    void,
    ServerError,
    {
      entries: Array<
        Omit<
          KnowledgeBaseEntry,
          '@timestamp' | 'confidence' | 'is_correction' | 'public' | 'labels'
        >
      >;
    }
  >(
    [REACT_QUERY_KEYS.IMPORT_KB_ENTRIES],
    ({ entries }) => {
      if (!observabilityAIAssistantApi) {
        return Promise.reject('Error with observabilityAIAssistantApi: API not found.');
      }

      return observabilityAIAssistantApi?.(
        'POST /internal/observability_ai_assistant/kb/entries/import',
        {
          signal: null,
          params: {
            body: {
              entries,
            },
          },
        }
      );
    },
    {
      onSuccess: (_data, { entries }) => {
        toasts.addSuccess(
          i18n.translate(
            'aiAssistantManagementObservability.kb.importEntries.successNotification',
            {
              defaultMessage: 'Successfully imported {number} items',
              values: { number: entries.length },
            }
          )
        );

        queryClient.invalidateQueries({
          queryKey: [REACT_QUERY_KEYS.GET_KB_ENTRIES],
          refetchType: 'all',
        });
      },
      onError: (error) => {
        toasts.addError(new Error(error.body?.message ?? error.message), {
          title: i18n.translate(
            'aiAssistantManagementObservability.kb.importEntries.errorNotification',
            {
              defaultMessage: 'Something went wrong while importing items',
            }
          ),
        });
      },
    }
  );
}
