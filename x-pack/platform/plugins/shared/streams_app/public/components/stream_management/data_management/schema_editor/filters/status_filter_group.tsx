/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { uniq } from 'lodash';
import { i18n } from '@kbn/i18n';
import type { EuiSelectableOption, EuiSelectableProps } from '@elastic/eui';
import { FilterGroup } from '../../../../../data_management/schema_editor/filters/filter_group';
import { FIELD_STATUS_MAP } from '../../../../../data_management/schema_editor/constants';
import type { TControlsChangeHandler } from '../../../../../data_management/schema_editor/hooks/use_controls';
import type { SchemaFieldStatus } from '../../../../../data_management/schema_editor/types';
import { useSchemaEditorContext } from '../../../../../data_management/schema_editor/schema_editor_context';
import { getStreamTypeFromDefinition } from '../../../../../../util/get_stream_type_from_definition';

const BUTTON_LABEL = i18n.translate(
  'xpack.streams.streamDetailSchemaEditor.fieldStatusFilterGroupButtonLabel',
  { defaultMessage: 'Status' }
);

export const FieldStatusFilterGroup = ({ onChange }: { onChange: TControlsChangeHandler }) => {
  const { fields, stream } = useSchemaEditorContext();
  const streamType = useMemo(() => getStreamTypeFromDefinition(stream), [stream]);

  const fieldStatus = useMemo(() => uniq(fields.map((field) => field.status)), [fields]);

  const [items, setItems] = useState<EuiSelectableOption[]>(() =>
    getStatusOptions(fieldStatus, streamType)
  );

  // This side effect is due to the fact that the available field status can be updated once the unmapped fields are fetched.
  useEffect(() => {
    setItems((prevItems) => {
      const prevSelection = new Map(prevItems.map((item) => [item.key, item.checked]));

      const nextItems = getStatusOptions(fieldStatus, streamType);

      nextItems.forEach((item) => {
        if (prevSelection.has(item.key)) {
          item.checked = prevSelection.get(item.key);
        }
      });

      return nextItems;
    });
  }, [fieldStatus, streamType]);

  const onChangeItems = useCallback<Required<EuiSelectableProps>['onChange']>(
    (nextItems) => {
      setItems(nextItems);
      onChange({
        status: nextItems
          .filter((nextItem) => nextItem.checked === 'on')
          .map((item) => item.key as SchemaFieldStatus),
      });
    },
    [onChange]
  );

  return (
    <FilterGroup items={items} filterGroupButtonLabel={BUTTON_LABEL} onChange={onChangeItems} />
  );
};

const getStatusOptions = (
  fieldStatus: SchemaFieldStatus[],
  streamType: ReturnType<typeof getStreamTypeFromDefinition>
): EuiSelectableOption[] => {
  return fieldStatus.map((key) => ({
    label: FIELD_STATUS_MAP[key === 'unmapped' && streamType === 'classic' ? 'dynamic' : key].label,
    key,
  }));
};
