/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutSize,
  EuiHorizontalRule,
  EuiSpacer,
} from '@elastic/eui';
import { BoolQuery } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { AlertConsumers } from '@kbn/rule-data-utils';
import React, { useMemo, useRef, useCallback, useState } from 'react';

import { calculateBucketSize } from './helpers';
import { buildEsQuery } from '../../../../utils/build_es_query';
import { getNewsFeed } from '../../../../services/get_news_feed';

import { DataSections, LoadingObservability, HeaderActions } from '../../components';
import { EmptySections } from '../../../../components/app/empty_sections';
import { ObservabilityHeaderMenu } from '../../../../components/app/header';
import { Resources } from '../../../../components/app/resources';
import { NewsFeed } from '../../../../components/app/news_feed';
import { SectionContainer } from '../../../../components/app/section';
import { ObservabilityStatusProgress } from '../../../../components/app/observability_status/observability_status_progress';

import { useBreadcrumbs } from '../../../../hooks/use_breadcrumbs';
import { useFetcher } from '../../../../hooks/use_fetcher';
import { useHasData } from '../../../../hooks/use_has_data';
import { usePluginContext } from '../../../../hooks/use_plugin_context';
import { useGetUserCasesPermissions } from '../../../../hooks/use_get_user_cases_permissions';
import { useDatePickerContext } from '../../../../hooks/use_date_picker_context';
import { useGuidedSetupProgress } from '../../../../hooks/use_guided_setup_progress';

import { observabilityFeatureId } from '../../../../../common';
import { paths } from '../../../../config';
import { ALERTS_PER_PAGE, ALERTS_TABLE_ID } from './constants';
import { DataAssistantFlyout } from '../../components/data_assistant_flyout';

import type { ObservabilityAppServices } from '../../../../application/types';
import { useOverviewMetrics } from './helpers/use_metrics';

export function OverviewPage() {
  const {
    cases: {
      ui: { getCasesContext },
    },
    http,
    triggersActionsUi: { alertsTableConfigurationRegistry, getAlertsStateTable: AlertsStateTable },
  } = useKibana<ObservabilityAppServices>().services;

  const { ObservabilityPageTemplate } = usePluginContext();

  useBreadcrumbs([
    {
      text: i18n.translate('xpack.observability.breadcrumbs.overviewLinkText', {
        defaultMessage: 'Overview',
      }),
    },
  ]);

  const { data: newsFeed } = useFetcher(() => getNewsFeed({ http }), [http]);
  const { hasAnyData, isAllRequestsComplete } = useHasData();
  const refetch = useRef<() => void>();

  const { trackMetric } = useOverviewMetrics({ hasAnyData });

  const CasesContext = getCasesContext();
  const userCasesPermissions = useGetUserCasesPermissions();

  const { relativeStart, relativeEnd, absoluteStart, absoluteEnd } = useDatePickerContext();

  const [esQuery, setEsQuery] = useState<{ bool: BoolQuery }>(
    buildEsQuery({
      from: relativeStart,
      to: relativeEnd,
    })
  );

  const bucketSize = useMemo(
    () =>
      calculateBucketSize({
        start: absoluteStart,
        end: absoluteEnd,
      }),
    [absoluteStart, absoluteEnd]
  );

  const [isDataAssistantFlyoutVisible, setIsDataAssistantFlyoutVisible] = useState(false);

  const { isGuidedSetupProgressDismissed } = useGuidedSetupProgress();
  const [isGuidedSetupTourVisible, setGuidedSetupTourVisible] = useState(false);
  const hideGuidedSetupTour = useCallback(() => setGuidedSetupTourVisible(false), []);

  const onTimeRangeRefresh = useCallback(() => {
    setEsQuery(
      buildEsQuery({
        from: relativeStart,
        to: relativeEnd,
      })
    );
    return refetch.current && refetch.current();
  }, [relativeEnd, relativeStart]);

  const handleGuidedSetupClick = useCallback(() => {
    if (isGuidedSetupProgressDismissed) {
      trackMetric({ metric: 'guided_setup_view_details_after_dismiss' });
    }

    hideGuidedSetupTour();

    setIsDataAssistantFlyoutVisible(true);
  }, [trackMetric, isGuidedSetupProgressDismissed, hideGuidedSetupTour]);

  if (hasAnyData === undefined) {
    return <LoadingObservability />;
  }

  return (
    <ObservabilityPageTemplate
      isPageDataLoaded={isAllRequestsComplete}
      pageHeader={{
        pageTitle: i18n.translate('xpack.observability.overview.pageTitle', {
          defaultMessage: 'Overview',
        }),
        rightSideItems: [
          <HeaderActions
            showTour={isGuidedSetupTourVisible}
            handleGuidedSetupClick={handleGuidedSetupClick}
            onTourDismiss={hideGuidedSetupTour}
            onTimeRangeRefresh={onTimeRangeRefresh}
          />,
        ],
      }}
    >
      <ObservabilityHeaderMenu />

      <ObservabilityStatusProgress
        onDismissClick={() => setGuidedSetupTourVisible(true)}
        onViewDetailsClick={() => setIsDataAssistantFlyoutVisible(true)}
      />

      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem>
          <SectionContainer
            initialIsOpen={hasAnyData}
            title={i18n.translate('xpack.observability.overview.alerts.title', {
              defaultMessage: 'Alerts',
            })}
            hasError={false}
            appLink={{
              href: paths.observability.alerts,
              label: i18n.translate('xpack.observability.overview.alerts.appLink', {
                defaultMessage: 'Show alerts',
              }),
            }}
          >
            <CasesContext
              owner={[observabilityFeatureId]}
              permissions={userCasesPermissions}
              features={{ alerts: { sync: false } }}
            >
              <AlertsStateTable
                alertsTableConfigurationRegistry={alertsTableConfigurationRegistry}
                configurationId={AlertConsumers.OBSERVABILITY}
                id={ALERTS_TABLE_ID}
                flyoutSize={'s' as EuiFlyoutSize}
                featureIds={[
                  AlertConsumers.APM,
                  AlertConsumers.INFRASTRUCTURE,
                  AlertConsumers.LOGS,
                  AlertConsumers.UPTIME,
                ]}
                query={esQuery}
                showExpandToDetails={false}
                pageSize={ALERTS_PER_PAGE}
              />
            </CasesContext>
          </SectionContainer>
        </EuiFlexItem>
        <EuiFlexItem>
          {/* Data sections */}
          {<DataSections bucketSize={bucketSize} />}
          <EmptySections />
        </EuiFlexItem>
        <EuiSpacer size="s" />
      </EuiFlexGroup>

      <EuiHorizontalRule />

      <EuiFlexGroup>
        <EuiFlexItem>
          {/* Resources / What's New sections */}
          <EuiFlexGroup>
            <EuiFlexItem grow={4}>
              {!!newsFeed?.items?.length && <NewsFeed items={newsFeed.items.slice(0, 3)} />}
            </EuiFlexItem>
            <EuiFlexItem grow={2}>
              <Resources />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isDataAssistantFlyoutVisible ? (
        <DataAssistantFlyout onClose={() => setIsDataAssistantFlyoutVisible(false)} />
      ) : null}
    </ObservabilityPageTemplate>
  );
}
