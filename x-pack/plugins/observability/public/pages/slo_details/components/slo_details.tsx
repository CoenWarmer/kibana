/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiNotificationBadge,
  EuiPanel,
  EuiSpacer,
  EuiTabbedContent,
  EuiTabbedContentTab,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { LogCategorization } from '@kbn/aiops-plugin/public';
import { SavedSearch } from '@kbn/saved-search-plugin/common';
import { SLOWithSummaryResponse } from '@kbn/slo-schema';
import { i18n } from '@kbn/i18n';

import { useKibana } from '../../../utils/kibana_react';
import { useCreateDataView } from '../../../hooks/use_create_data_view';
import { useFetchActiveAlerts } from '../../../hooks/slo/use_fetch_active_alerts';
import { formatHistoricalData } from '../../../utils/slo/chart_data_formatter';
import { useFetchHistoricalSummary } from '../../../hooks/slo/use_fetch_historical_summary';
import { ErrorBudgetChartPanel } from './error_budget_chart_panel';
import { Overview } from './overview/overview';
import { SliChartPanel } from './sli_chart_panel';
import { SloDetailsAlerts } from './slo_detail_alerts';
import { BurnRates } from './burn_rates';

export interface Props {
  slo: SLOWithSummaryResponse;
  isAutoRefreshing: boolean;
}

const TAB_ID_URL_PARAM = 'tabId';
const OVERVIEW_TAB_ID = 'overview';
const ALERTS_TAB_ID = 'alerts';

type TabId = typeof OVERVIEW_TAB_ID | typeof ALERTS_TAB_ID;

export function SloDetails({ slo, isAutoRefreshing }: Props) {
  const {
    application,
    data,
    executionContext,
    charts,
    fieldFormats,
    http,
    lens,
    notifications,
    share,
    storage,
    theme,
    uiSettings,
    unifiedSearch,
  } = useKibana().services;
  const { search } = useLocation();
  const { data: activeAlerts } = useFetchActiveAlerts({
    sloIds: [slo.id],
  });

  const { isLoading: historicalSummaryLoading, data: historicalSummaryBySlo = {} } =
    useFetchHistoricalSummary({ sloIds: [slo.id], shouldRefetch: isAutoRefreshing });

  const errorBudgetBurnDownData = formatHistoricalData(
    historicalSummaryBySlo[slo.id],
    'error_budget_remaining'
  );
  const historicalSliData = formatHistoricalData(historicalSummaryBySlo[slo.id], 'sli_value');

  // 'remote_cluster:traces-apm*,remote_cluster:metrics-apm*,remote_cluster:logs-apm*'
  const { dataView } = useCreateDataView({
    indexPatternString: 'remote_cluster:logs-apm*',
    timeFieldName: '@timestamp',
  });

  const tabs: EuiTabbedContentTab[] = [
    {
      id: OVERVIEW_TAB_ID,
      name: i18n.translate('xpack.observability.slo.sloDetails.tab.overviewLabel', {
        defaultMessage: 'Overview',
      }),
      'data-test-subj': 'overviewTab',
      content: (
        <Fragment>
          <EuiSpacer size="l" />
          <EuiFlexGroup direction="column" gutterSize="xl">
            <EuiFlexItem>
              <Overview slo={slo} />
            </EuiFlexItem>
            <EuiFlexGroup direction="column" gutterSize="l">
              <EuiFlexItem>
                <BurnRates slo={slo} isAutoRefreshing={isAutoRefreshing} />
              </EuiFlexItem>
              <EuiFlexItem>
                <SliChartPanel
                  data={historicalSliData}
                  isLoading={historicalSummaryLoading}
                  slo={slo}
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <ErrorBudgetChartPanel
                  data={errorBudgetBurnDownData}
                  isLoading={historicalSummaryLoading}
                  slo={slo}
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel
                  paddingSize="m"
                  color="transparent"
                  hasBorder
                  data-test-subj="errorBudgetChartPanel"
                >
                  <EuiTitle size="xs">
                    <h2>
                      {i18n.translate('xpack.observability.slo.sloDetails.logAnalysis.title', {
                        defaultMessage: 'Log analysis',
                      })}
                    </h2>
                  </EuiTitle>
                  <EuiText color="subdued" size="s">
                    {i18n.translate('xpack.observability.slo.sloDetails.logAnalysis.subtitle', {
                      defaultMessage: 'See recurring patterns in your logs (last 6 hours)',
                    })}
                  </EuiText>
                  {dataView ? (
                    <LogCategorization
                      appDependencies={{
                        application,
                        data,
                        executionContext,
                        charts,
                        fieldFormats,
                        http,
                        lens,
                        notifications,
                        share,
                        storage,
                        theme,
                        uiSettings,
                        unifiedSearch,
                      }}
                      dataView={dataView}
                      hideDocuments
                      hideSearch
                      hideTitle
                      initialCategoryField="error.log.message"
                      savedSearch={'' as unknown as SavedSearch}
                    />
                  ) : null}

                  <EuiSpacer size="l" />
                  <EuiButton
                    color="primary"
                    data-test-subj="o11ySloDetailsDiagnoseFurtherInApmButton"
                    fill
                  >
                    Diagnose in APM
                  </EuiButton>
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexGroup>
        </Fragment>
      ),
    },
    {
      id: ALERTS_TAB_ID,
      name: i18n.translate('xpack.observability.slo.sloDetails.tab.alertsLabel', {
        defaultMessage: 'Alerts',
      }),
      'data-test-subj': 'alertsTab',
      append: (
        <EuiNotificationBadge className="eui-alignCenter" size="m">
          {(activeAlerts && activeAlerts[slo.id]?.count) ?? 0}
        </EuiNotificationBadge>
      ),
      content: <SloDetailsAlerts slo={slo} />,
    },
  ];

  const [selectedTabId, setSelectedTabId] = useState(() => {
    const searchParams = new URLSearchParams(search);
    const urlTabId = searchParams.get(TAB_ID_URL_PARAM);
    return urlTabId && [OVERVIEW_TAB_ID, ALERTS_TAB_ID].includes(urlTabId)
      ? (urlTabId as TabId)
      : OVERVIEW_TAB_ID;
  });

  const handleSelectedTab = (newTabId: TabId) => {
    setSelectedTabId(newTabId);
  };

  return (
    <EuiTabbedContent
      data-test-subj="sloDetailsTabbedContent"
      tabs={tabs}
      selectedTab={tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0]}
      onTabClick={(tab) => handleSelectedTab(tab.id as TabId)}
    />
  );
}
