/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const observabilityFeatureId = 'observability';
export const observabilityAppId = 'observability-overview';
export const casesFeatureId = 'observabilityCases';
export const sloFeatureId = 'slo';

export {
  CLOUD,
  CLOUD_AVAILABILITY_ZONE,
  CLOUD_PROVIDER,
  CLOUD_REGION,
  CLOUD_MACHINE_TYPE,
  SERVICE,
  SERVICE_NAME,
  SERVICE_ENVIRONMENT,
  SERVICE_FRAMEWORK_NAME,
  SERVICE_FRAMEWORK_VERSION,
  SERVICE_LANGUAGE_NAME,
  SERVICE_LANGUAGE_VERSION,
  SERVICE_RUNTIME_NAME,
  SERVICE_RUNTIME_VERSION,
  SERVICE_NODE_NAME,
  SERVICE_VERSION,
  AGENT,
  AGENT_NAME,
  AGENT_VERSION,
  URL_FULL,
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  USER_ID,
  USER_AGENT_ORIGINAL,
  USER_AGENT_NAME,
  USER_AGENT_VERSION,
  DESTINATION_ADDRESS,
  OBSERVER_HOSTNAME,
  OBSERVER_VERSION_MAJOR,
  OBSERVER_LISTENING,
  PROCESSOR_EVENT,
  TRANSACTION_DURATION,
  TRANSACTION_DURATION_HISTOGRAM,
  TRANSACTION_TYPE,
  TRANSACTION_RESULT,
  TRANSACTION_NAME,
  TRANSACTION_ID,
  TRANSACTION_SAMPLED,
  TRANSACTION_PAGE_URL,
  TRANSACTION_ROOT,
  EVENT_OUTCOME,
  TRACE_ID,
  SPAN_DURATION,
  SPAN_TYPE,
  SPAN_SUBTYPE,
  SPAN_SELF_TIME_SUM,
  SPAN_ACTION,
  SPAN_NAME,
  SPAN_ID,
  SPAN_DESTINATION_SERVICE_RESOURCE,
  SPAN_DESTINATION_SERVICE_RESPONSE_TIME_COUNT,
  SPAN_DESTINATION_SERVICE_RESPONSE_TIME_SUM,
  PARENT_ID,
  ERROR_GROUP_ID,
  ERROR_CULPRIT,
  ERROR_LOG_LEVEL,
  ERROR_LOG_MESSAGE,
  ERROR_EXC_MESSAGE,
  ERROR_EXC_HANDLED,
  ERROR_EXC_TYPE,
  ERROR_PAGE_URL,
  METRIC_SYSTEM_FREE_MEMORY,
  METRIC_SYSTEM_MEMORY_USAGE,
  METRIC_SYSTEM_CPU_USAGE,
  METRIC_SYSTEM_TOTAL_MEMORY,
  METRIC_SYSTEM_CPU_PERCENT,
  METRIC_PROCESS_CPU_PERCENT,
  METRIC_CGROUP_MEMORY_LIMIT_BYTES,
  METRIC_CGROUP_MEMORY_USAGE_BYTES,
  METRIC_JAVA_HEAP_MEMORY_MAX,
  METRIC_JAVA_HEAP_MEMORY_COMMITTED,
  METRIC_JAVA_HEAP_MEMORY_USED,
  METRIC_JAVA_NON_HEAP_MEMORY_MAX,
  METRIC_JAVA_NON_HEAP_MEMORY_COMMITTED,
  METRIC_JAVA_NON_HEAP_MEMORY_USED,
  METRIC_JAVA_THREAD_COUNT,
  METRIC_JAVA_GC_COUNT,
  METRIC_JAVA_GC_TIME,
  LABEL_NAME,
  HOST,
  HOST_HOSTNAME,
  HOST_OS_PLATFORM,
  CONTAINER_ID,
  KUBERNETES,
  POD_NAME,
  CLIENT_GEO_COUNTRY_ISO_CODE,
  CLIENT_GEO_COUNTRY_NAME,
  TRANSACTION_URL,
  CLIENT_GEO,
  USER_AGENT_DEVICE,
  USER_AGENT_OS,
  USER_AGENT_OS_VERSION,
  TRANSACTION_TIME_TO_FIRST_BYTE,
  TRANSACTION_DOM_INTERACTIVE,
  FCP_FIELD,
  LCP_FIELD,
  TBT_FIELD,
  FID_FIELD,
  CLS_FIELD,
  PROFILE_ID,
  PROFILE_DURATION,
  PROFILE_TOP_ID,
  PROFILE_STACK,
  PROFILE_SAMPLES_COUNT,
  PROFILE_CPU_NS,
  PROFILE_WALL_US,
  PROFILE_ALLOC_OBJECTS,
  PROFILE_ALLOC_SPACE,
  PROFILE_INUSE_OBJECTS,
  PROFILE_INUSE_SPACE,
} from './elasticsearch_fieldnames';

export { ObservabilityTriggerId } from './trigger_ids';
export { getInspectResponse } from './utils/get_inspect_response';

export type { AlertStatus, AlertStatusFilter } from './types';

/* LOCATORS */

// Observability
export { ObservabilityAlertsLocator, alertsLocatorID } from './locators/observability/alerts';
export {
  ObservabilityRuleDetailsLocator,
  ruleDetailsLocatorID,
} from './locators/observability/rule_details';
export { ObservabilityRulesLocator, rulesLocatorID } from './locators/observability/rules';
export {
  ObservabilitySloDetailsLocator,
  sloDetailsLocatorID,
} from './locators/observability/slo_details';
export { ObservabilitySloEditLocator, sloEditLocatorID } from './locators/observability/slo_edit';

export type { AlertsLocatorParams } from './locators/observability/alerts';
export type { RulesParams } from './locators/observability/rules';
export type { SloEditLocatorParams } from './locators/observability/slo_edit';

// Synthetics
export { syntheticsEditMonitorLocatorID } from './locators/synthetics/edit_monitor';
export { syntheticsMonitorDetailLocatorID } from './locators/synthetics/monitor_detail';
export { syntheticsSettingsLocatorID } from './locators/synthetics/settings';
export { uptimeOverviewLocatorID } from './locators/synthetics/overview';
