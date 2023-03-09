/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { KibanaReactStorybookDecorator } from '../../../utils/kibana_react.storybook_decorator';
import { Cases } from './cases';

export default {
  title: 'app/Cases',
  component: Cases,
  decorators: [KibanaReactStorybookDecorator],
};

export function AllPermissions() {
  return (
    <Cases
      permissions={{ read: true, all: true, create: true, delete: true, push: true, update: true }}
    />
  );
}
