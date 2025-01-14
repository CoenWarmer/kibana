/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiLoadingSpinnerProps } from '@elastic/eui';
import { CoreStart } from '@kbn/core/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { Storage } from '@kbn/kibana-utils-plugin/public';
import { LazyObservabilityPageTemplateProps } from '@kbn/observability-shared-plugin/public';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PluginContext } from '../context/plugin_context';
import { MultiplayerPublicPluginsStart } from '../types';

interface Props {
  core: CoreStart;
  plugins: MultiplayerPublicPluginsStart;
  ObservabilityPageTemplate: React.ComponentType<LazyObservabilityPageTemplateProps>;
  isDev?: boolean;
  kibanaVersion: string;
  isServerless?: boolean;
}

export type LazyWithContextProviders = ReturnType<typeof getLazyWithContextProviders>;

interface Options {
  spinnerSize?: EuiLoadingSpinnerProps['size'];
}

export const getLazyWithContextProviders =
  ({ core, plugins, ObservabilityPageTemplate, isDev, kibanaVersion, isServerless }: Props) =>
  <TElement extends React.ComponentType<any>>(
    LazyComponent: React.LazyExoticComponent<TElement>,
    options?: Options
  ): React.FunctionComponent<React.ComponentProps<TElement>> => {
    const { spinnerSize = 'xl' } = options ?? {};
    const queryClient = new QueryClient();
    return (props) => (
      <KibanaContextProvider
        services={{
          ...core,
          ...plugins,
          storage: new Storage(localStorage),
          isDev,
          kibanaVersion,
          isServerless,
        }}
      >
        <PluginContext.Provider
          value={{
            isDev,
            ObservabilityPageTemplate,
          }}
        >
          <QueryClientProvider client={queryClient}>
            <Suspense fallback={<LoadingSpinner size={spinnerSize} />}>
              <LazyComponent {...props} />
            </Suspense>
          </QueryClientProvider>
        </PluginContext.Provider>
      </KibanaContextProvider>
    );
  };

function LoadingSpinner({ size }: { size: EuiLoadingSpinnerProps['size'] }) {
  return (
    <EuiFlexGroup justifyContent="center">
      <EuiFlexItem grow={false}>
        <EuiLoadingSpinner size={size} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
