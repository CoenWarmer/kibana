/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { EuiFlyoutFooter, EuiFlexGroup, EuiFlexItem, EuiButton } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../utils/kibana_react';
import { usePluginContext } from '../hooks/use_plugin_context';
import { isAlertDetailsEnabledPerApp } from '../utils/is_alert_details_enabled';
import { paths } from '../routes/routes';
import type { TopAlert } from '../typings/alerts';

interface FlyoutProps {
  alert: TopAlert;
  id?: string;
}

export function AlertsFlyoutFooter({ alert, isInApp }: FlyoutProps & { isInApp: boolean }) {
  const {
    http: {
      basePath: { prepend },
    },
  } = useKibana().services;
  const { config } = usePluginContext();

  const getAlertDetailsButton = () => {
    if (!isAlertDetailsEnabledPerApp(alert, config)) return <></>;
    return (
      <EuiFlexItem grow={false}>
        <EuiButton
          fill
          data-test-subj="alertsFlyoutAlertDetailsButton"
          href={prepend(paths.observability.alertDetails(alert.fields['kibana.alert.uuid']))}
        >
          {i18n.translate('xpack.observability.alertsFlyout.alertsDetailsButtonText', {
            defaultMessage: 'Alert details',
          })}
        </EuiButton>
      </EuiFlexItem>
    );
  };

  const getViewInAppUrlButton = () => {
    if (!alert.link || isInApp) return <></>;
    return (
      <EuiFlexItem grow={false}>
        <EuiButton fill data-test-subj="alertsFlyoutViewInAppButton" href={prepend(alert.link)}>
          {i18n.translate('xpack.observability.alertsFlyout.viewInAppButtonText', {
            defaultMessage: 'View in app',
          })}
        </EuiButton>
      </EuiFlexItem>
    );
  };

  return (
    <EuiFlyoutFooter>
      <EuiFlexGroup justifyContent="flexEnd">
        {getViewInAppUrlButton()}
        {getAlertDetailsButton()}
      </EuiFlexGroup>
    </EuiFlyoutFooter>
  );
}
