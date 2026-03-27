/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type { PreservedTimeUnit, TimeUnit } from '../../../../../data_management/stream_detail_lifecycle/downsampling/shared/time_unit_types';
export { TIME_UNIT_OPTIONS } from '../../../../../data_management/stream_detail_lifecycle/downsampling/shared/time_unit_options';

export {
  formatMillisecondsInUnit,
  getDoubledDurationFromPrevious,
  parseInterval,
  toMilliseconds,
} from '../../../../../data_management/stream_detail_lifecycle/downsampling/shared/duration_utils';

export { getBoundsHelpTextValues } from '../../../../../data_management/stream_detail_lifecycle/downsampling/shared/bounds_help_text';
export { getUnitSelectOptions, isPreservedNonDefaultUnit } from '../../../../../data_management/stream_detail_lifecycle/downsampling/shared/unit_select_options';
export type { TimeUnitSelectOption } from '../../../../../data_management/stream_detail_lifecycle/downsampling/shared/unit_select_options';
export { downsamplingHelpText } from '../../../../../data_management/stream_detail_lifecycle/downsampling/shared/i18n';
