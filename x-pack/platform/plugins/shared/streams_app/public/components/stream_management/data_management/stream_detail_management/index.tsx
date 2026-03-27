/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { Streams } from '@kbn/streams-schema';
import { useStreamDetail } from '../../../../../hooks/use_stream_detail';
import { WiredStreamDetailManagement } from '../../../../data_management/stream_detail_management/wired';
import { ClassicStreamDetailManagement } from '../../../../data_management/stream_detail_management/classic';
import { QueryStreamDetailManagement } from '../../../../data_management/stream_detail_management/query';

export function StreamDetailManagement() {
  const { definition, refresh } = useStreamDetail();

  if (Streams.WiredStream.GetResponse.is(definition)) {
    return <WiredStreamDetailManagement definition={definition} refreshDefinition={refresh} />;
  }

  if (Streams.QueryStream.GetResponse.is(definition)) {
    return <QueryStreamDetailManagement definition={definition} refreshDefinition={refresh} />;
  }

  return <ClassicStreamDetailManagement definition={definition} refreshDefinition={refresh} />;
}
