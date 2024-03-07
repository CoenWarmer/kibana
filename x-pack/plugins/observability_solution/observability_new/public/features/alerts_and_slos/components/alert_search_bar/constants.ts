/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Query } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import {
  ALERT_STATUS_ACTIVE,
  ALERT_STATUS_RECOVERED,
  ALERT_STATUS_UNTRACKED,
  ALERT_STATUS,
} from '@kbn/rule-data-utils';
import { AlertStatusFilter } from '../../../../../common/features/alerts_and_slos/typings';
import { ALERT_STATUS_ALL } from '../../../../../common/features/alerts_and_slos/constants';

export const DEFAULT_QUERIES: Query[] = [];
export const DEFAULT_QUERY_STRING = '';

export const ALL_ALERTS: AlertStatusFilter = {
  status: ALERT_STATUS_ALL,
  query: '',
  label: i18n.translate('xpack.observability.alerts.alertStatusFilter.showAll', {
    defaultMessage: 'Show all',
  }),
};

export const ACTIVE_ALERTS: AlertStatusFilter = {
  status: ALERT_STATUS_ACTIVE,
  query: `${ALERT_STATUS}: "${ALERT_STATUS_ACTIVE}"`,
  label: i18n.translate('xpack.observability.alerts.alertStatusFilter.active', {
    defaultMessage: 'Active',
  }),
};

export const RECOVERED_ALERTS: AlertStatusFilter = {
  status: ALERT_STATUS_RECOVERED,
  query: `${ALERT_STATUS}: "${ALERT_STATUS_RECOVERED}"`,
  label: i18n.translate('xpack.observability.alerts.alertStatusFilter.recovered', {
    defaultMessage: 'Recovered',
  }),
};

export const UNTRACKED_ALERTS: AlertStatusFilter = {
  status: ALERT_STATUS_UNTRACKED,
  query: `${ALERT_STATUS}: "${ALERT_STATUS_UNTRACKED}"`,
  label: i18n.translate('xpack.observability.alerts.alertStatusFilter.untracked', {
    defaultMessage: 'Untracked',
  }),
};

export const ALERT_STATUS_QUERY = {
  [ACTIVE_ALERTS.status]: ACTIVE_ALERTS.query,
  [RECOVERED_ALERTS.status]: RECOVERED_ALERTS.query,
  [UNTRACKED_ALERTS.status]: UNTRACKED_ALERTS.query,
};
