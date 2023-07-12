/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const syntheticsEditMonitorLocatorID = 'SYNTHETICS_EDIT_MONITOR_LOCATOR';

async function navigate({ configId }: { configId: string }) {
  return {
    app: 'synthetics',
    path: `/edit-monitor/${configId}`,
    state: {},
  };
}

export const syntheticsEditMonitorLocator = {
  id: syntheticsEditMonitorLocatorID,
  getLocation: navigate,
};
