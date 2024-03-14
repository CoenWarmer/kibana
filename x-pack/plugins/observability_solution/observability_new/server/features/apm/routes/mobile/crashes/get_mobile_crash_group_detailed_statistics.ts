/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { keyBy } from 'lodash';
import {
  kqlQuery,
  rangeQuery,
  termQuery,
  termsQuery,
} from '../../../../alerts_and_slos/utils/queries';
import { ProcessorEvent } from '../../../../../common/features/alerts_and_slos';
import { offsetPreviousPeriodCoordinates } from '../../../../../../common/features/apm/utils/offset_previous_period_coordinate';
import { Coordinate } from '../../../../typings/timeseries';
import {
  ERROR_GROUP_ID,
  ERROR_TYPE,
  SERVICE_NAME,
} from '../../../../../../common/features/apm/es_fields/apm';
import { environmentQuery } from '../../../../../../common/features/apm/utils/environment_query';
import { getBucketSize } from '../../../../../../common/features/apm/utils/get_bucket_size';
import { getOffsetInMs } from '../../../../../../common/features/apm/utils/get_offset_in_ms';
import { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';

interface CrashGroupDetailedStat {
  groupId: string;
  timeseries: Coordinate[];
}

export async function getMobileCrashesGroupDetailedStatistics({
  kuery,
  serviceName,
  apmEventClient,
  numBuckets,
  groupIds,
  environment,
  start,
  end,
  offset,
}: {
  kuery: string;
  serviceName: string;
  apmEventClient: APMEventClient;
  numBuckets: number;
  groupIds: string[];
  environment: string;
  start: number;
  end: number;
  offset?: string;
}): Promise<CrashGroupDetailedStat[]> {
  const { startWithOffset, endWithOffset } = getOffsetInMs({
    start,
    end,
    offset,
  });

  const { intervalString } = getBucketSize({
    start: startWithOffset,
    end: endWithOffset,
    numBuckets,
  });

  const timeseriesResponse = await apmEventClient.search(
    'get_service_error_group_detailed_statistics',
    {
      apm: {
        events: [ProcessorEvent.error],
      },
      body: {
        track_total_hits: false,
        size: 0,
        query: {
          bool: {
            filter: [
              ...termsQuery(ERROR_GROUP_ID, ...groupIds),
              ...termsQuery(ERROR_TYPE, 'crash'),
              ...termQuery(SERVICE_NAME, serviceName),
              ...rangeQuery(startWithOffset, endWithOffset),
              ...environmentQuery(environment),
              ...kqlQuery(kuery),
            ],
          },
        },
        aggs: {
          error_groups: {
            terms: {
              field: ERROR_GROUP_ID,
              size: 500,
            },
            aggs: {
              timeseries: {
                date_histogram: {
                  field: '@timestamp',
                  fixed_interval: intervalString,
                  min_doc_count: 0,
                  extended_bounds: {
                    min: startWithOffset,
                    max: endWithOffset,
                  },
                },
              },
            },
          },
        },
      },
    }
  );

  if (!timeseriesResponse.aggregations) {
    return [];
  }

  return timeseriesResponse.aggregations.error_groups.buckets.map((bucket) => {
    const groupId = bucket.key as string;
    return {
      groupId,
      timeseries: bucket.timeseries.buckets.map((timeseriesBucket) => {
        return {
          x: timeseriesBucket.key,
          y: timeseriesBucket.doc_count,
        };
      }),
    };
  });
}

export interface MobileCrashesGroupPeriodsResponse {
  currentPeriod: Record<string, CrashGroupDetailedStat>;
  previousPeriod: Record<string, CrashGroupDetailedStat>;
}

export async function getMobileCrashesGroupPeriods({
  kuery,
  serviceName,
  apmEventClient,
  numBuckets,
  groupIds,
  environment,
  start,
  end,
  offset,
}: {
  kuery: string;
  serviceName: string;
  apmEventClient: APMEventClient;
  numBuckets: number;
  groupIds: string[];
  environment: string;
  start: number;
  end: number;
  offset?: string;
}): Promise<MobileCrashesGroupPeriodsResponse> {
  const commonProps = {
    environment,
    kuery,
    serviceName,
    apmEventClient,
    numBuckets,
    groupIds,
  };

  const currentPeriodPromise = getMobileCrashesGroupDetailedStatistics({
    ...commonProps,
    start,
    end,
  });

  const previousPeriodPromise = offset
    ? getMobileCrashesGroupDetailedStatistics({
        ...commonProps,
        start,
        end,
        offset,
      })
    : [];

  const [currentPeriod, previousPeriod] = await Promise.all([
    currentPeriodPromise,
    previousPeriodPromise,
  ]);

  const firstCurrentPeriod = currentPeriod?.[0];

  return {
    currentPeriod: keyBy(currentPeriod, 'groupId'),
    previousPeriod: keyBy(
      previousPeriod.map((crashRateGroup) => ({
        ...crashRateGroup,
        timeseries: offsetPreviousPeriodCoordinates({
          currentPeriodTimeseries: firstCurrentPeriod?.timeseries,
          previousPeriodTimeseries: crashRateGroup.timeseries,
        }),
      })),
      'groupId'
    ),
  };
}
