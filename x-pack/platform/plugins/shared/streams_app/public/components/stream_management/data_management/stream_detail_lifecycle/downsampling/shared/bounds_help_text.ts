/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PreservedTimeUnit } from '../../../../../../data_management/stream_detail_lifecycle/downsampling/shared/time_unit_types';
import { formatMillisecondsInUnit } from '../../../../../../data_management/stream_detail_lifecycle/downsampling/shared/duration_utils';
import { getTimeSizeAndUnitLabel } from '../../../../../../data_management/stream_detail_lifecycle/helpers/format_size_units';

export const getBoundsHelpTextValues = ({
  lowerBoundMs,
  upperBoundMs,
  unit,
}: {
  lowerBoundMs: number;
  upperBoundMs: number | undefined;
  unit: PreservedTimeUnit;
}): { min: string; max: string | undefined } => {
  const minRaw = formatMillisecondsInUnit(lowerBoundMs, unit);
  const maxRaw =
    upperBoundMs === undefined ? undefined : formatMillisecondsInUnit(upperBoundMs, unit);

  const min = getTimeSizeAndUnitLabel(minRaw) ?? minRaw;
  const max = maxRaw === undefined ? undefined : getTimeSizeAndUnitLabel(maxRaw) ?? maxRaw;
  return { min, max };
};
