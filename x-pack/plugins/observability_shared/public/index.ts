/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ObservabilitySharedPlugin } from './plugin';
export type {
  ObservabilitySharedPlugin,
  ObservabilitySharedPluginSetup,
  ObservabilitySharedPluginStart,
} from './plugin';
export const plugin = () => {
  return new ObservabilitySharedPlugin();
};

export type {
  ObservabilityPageTemplateProps,
  LazyObservabilityPageTemplateProps,
} from './components/page_template/page_template';

export type { NavigationEntry } from './components/page_template/page_template';
export { HeaderMenuPortal } from './components/header_menu';
export { useObservabilityTourContext } from './components/tour';
export { ActionMenu, ActionMenuDivider } from './components/action_menu/action_menu';
export {
  Section,
  SectionLink,
  SectionLinks,
  SectionSpacer,
  SectionSubtitle,
  SectionTitle,
} from './components/section/section';
export type { SectionLinkProps } from './components/section/section';

export {
  observabilityFeatureId,
  observabilityAppId,
  casesFeatureId,
  sloFeatureId,
} from '../common';

export { useTheme } from './hooks/use_theme';
export { InspectorContextProvider } from './contexts/inspector/inspector_context';
export { useInspectorContext } from './contexts/inspector/use_inspector_context';
export { useEsSearch, createEsParams } from './hooks/use_es_search';
export { useFetcher, FETCH_STATUS } from './hooks/use_fetcher';
export { useKibanaSpace } from './hooks/use_kibana_space';
export { useBreadcrumbs } from './hooks/use_breadcrumbs';
export {
  METRIC_TYPE,
  useTrackMetric,
  useUiTracker,
  useTrackPageview,
} from './hooks/use_track_metric';
export type { TrackEvent } from './hooks/use_track_metric';
export { useQuickTimeRanges } from './hooks/use_quick_time_ranges';
export { useGetUserCasesPermissions } from './hooks/use_get_user_cases_permissions';

export type { ApmIndicesConfig, UXMetrics } from './types';
export { noCasesPermissions } from './utils/cases_permissions';
