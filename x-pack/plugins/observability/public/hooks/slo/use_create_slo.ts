/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useState } from 'react';
import { isObject, snakeCase, transform } from 'lodash';
import { useKibana } from '../../utils/kibana_react';
import { SLO } from '../../typings';

interface UseCreateSlo {
  loading: boolean;
  success: boolean;
  error: string | undefined;
  createSlo: (slo: Omit<SLO, 'id'>) => void;
}

const covertToSnakeCase = (obj: Record<string, unknown>) =>
  transform(obj, (acc: Record<string, unknown>, value, key, target) => {
    const camelKey = Array.isArray(target) ? key : snakeCase(key);
    acc[camelKey] = isObject(value) ? covertToSnakeCase(value as Record<string, unknown>) : value;
  });

export function useCreateSlo(): UseCreateSlo {
  const { http } = useKibana().services;
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const createSlo = useCallback(
    async (slo: Omit<SLO, 'id'>) => {
      setLoading(true);
      setError('');
      setSuccess(false);
      const body = JSON.stringify(covertToSnakeCase(slo));

      try {
        await http.post<string>(`/api/observability/slos`, {
          body,
        });
        setSuccess(true);
      } catch (e) {
        setError(e);
      }
    },
    [http]
  );

  return {
    loading,
    error,
    success,
    createSlo,
  };
}
