/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useMemo } from 'react';
import { EuiErrorBoundary } from '@elastic/eui';
import type { CoreStart, CoreTheme } from '@kbn/core/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { RedirectAppLinks } from '@kbn/shared-ux-link-redirect-app';
import type { History } from 'history';
import type { Observable } from 'rxjs';
import { KibanaThemeProvider } from '@kbn/react-kibana-context-theme';
import type { HighCardinalityIndexerPluginStartDependencies } from './types';
import { MainRoute } from './components/MainRoute';

export function Application({
  coreStart,
  history,
  pluginsStart,
  theme$,
}: {
  coreStart: CoreStart;
  history: History;
  pluginsStart: HighCardinalityIndexerPluginStartDependencies;
  theme$: Observable<CoreTheme>;
}) {
  const theme = useMemo(() => {
    return { theme$ };
  }, [theme$]);

  return (
    <EuiErrorBoundary>
      <KibanaThemeProvider theme={theme}>
        <KibanaContextProvider
          services={{
            ...coreStart,
            plugins: {
              start: pluginsStart,
            },
          }}
        >
          <RedirectAppLinks coreStart={coreStart}>
            <coreStart.i18n.Context>
              <MainRoute />
            </coreStart.i18n.Context>
          </RedirectAppLinks>
        </KibanaContextProvider>
      </KibanaThemeProvider>
    </EuiErrorBoundary>
  );
}
