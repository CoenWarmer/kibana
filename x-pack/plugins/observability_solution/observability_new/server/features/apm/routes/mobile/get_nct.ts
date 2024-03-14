/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kqlQuery, rangeQuery, termQuery } from '../../../alerts_and_slos/utils/queries';
import {
  NETWORK_CONNECTION_TYPE,
  SERVICE_NAME,
} from '../../../../../common/features/apm/es_fields/apm';
import { environmentQuery } from '../../../../../common/features/apm/utils/environment_query';
import { ApmDocumentType } from '../../../../../common/features/apm/document_type';
import { RollupInterval } from '../../../../../common/features/apm/rollup';
import { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';

export async function getNCT({
  kuery,
  apmEventClient,
  serviceName,
  environment,
  start,
  end,
  size,
}: {
  kuery: string;
  apmEventClient: APMEventClient;
  serviceName: string;
  transactionType?: string;
  environment: string;
  start: number;
  end: number;
  size: number;
}) {
  return await apmEventClient.search('get_mobile_nct', {
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.SpanEvent,
          rollupInterval: RollupInterval.None,
        },
      ],
    },
    body: {
      track_total_hits: false,
      size: 0,
      query: {
        bool: {
          filter: [
            ...termQuery(SERVICE_NAME, serviceName),
            ...rangeQuery(start, end),
            ...environmentQuery(environment),
            ...kqlQuery(kuery),
          ],
        },
      },
      aggs: {
        netConnectionTypes: {
          terms: {
            field: NETWORK_CONNECTION_TYPE,
            size,
          },
        },
      },
    },
  });
}
