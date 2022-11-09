/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React, { ComponentType } from 'react';
import { Provider } from 'react-redux';

export function WithStore<T extends object = Record<string, any>>(store: any) {
  return (WrappedComponent: ComponentType<T>) => (props: any) =>
    (
      <Provider store={store}>
        <WrappedComponent {...props} />
      </Provider>
    );
}
