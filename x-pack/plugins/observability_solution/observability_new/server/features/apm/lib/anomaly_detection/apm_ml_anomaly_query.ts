/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import {
  AnomalyDetectorType,
  getAnomalyDetectorIndex,
} from '../../../../../common/features/apm/anomaly_detection/apm_ml_detectors';
import { termQuery, termsQuery } from '../../../alerts_and_slos/utils/queries';

export function apmMlAnomalyQuery({
  serviceName,
  transactionType,
  detectorTypes,
}: {
  serviceName?: string;
  detectorTypes?: AnomalyDetectorType[];
  transactionType?: string;
}) {
  return [
    {
      bool: {
        filter: [
          {
            bool: {
              should: [
                {
                  bool: {
                    filter: [
                      ...termQuery('is_interim', false),
                      ...termQuery('result_type', 'record'),
                    ],
                  },
                },
                {
                  bool: {
                    filter: termQuery('result_type', 'model_plot'),
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
          ...termsQuery(
            'detector_index',
            ...(detectorTypes?.map((type) => getAnomalyDetectorIndex(type)) ?? [])
          ),
          ...termQuery('partition_field_value', serviceName),
          ...termQuery('by_field_value', transactionType),
        ],
      },
    },
  ] as QueryDslQueryContainer[];
}
