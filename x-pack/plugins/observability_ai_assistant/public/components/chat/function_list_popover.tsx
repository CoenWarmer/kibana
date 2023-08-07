/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import {
  EuiButtonEmpty,
  EuiContextMenu,
  EuiContextMenuPanel,
  EuiPopover,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FunctionDefinition } from '../../../common/types';

export function FunctionListPopover({
  functions,
  selectedFunction,
  onSelectFunction,
}: {
  functions: FunctionDefinition[];
  selectedFunction?: FunctionDefinition;
  onSelectFunction: (func: FunctionDefinition) => void;
}) {
  const [isFunctionListOpen, setIsFunctionListOpen] = useState(false);

  const handleClickFunctionList = () => {
    setIsFunctionListOpen(!isFunctionListOpen);
  };

  const handleSelectFunction = (func: FunctionDefinition) => {
    setIsFunctionListOpen(false);
    onSelectFunction(func);
  };

  useEffect(() => {
    const keyboardListener = (event: KeyboardEvent) => {
      if (event.shiftKey && event.code === 'Digit4') {
        setIsFunctionListOpen(true);
      }
    };

    window.addEventListener('keyup', keyboardListener);

    return () => {
      window.removeEventListener('keyup', keyboardListener);
    };
  }, []);

  return (
    <EuiPopover
      anchorPosition="downLeft"
      button={
        <EuiButtonEmpty
          iconType="arrowRight"
          iconSide="right"
          size="xs"
          onClick={handleClickFunctionList}
        >
          {selectedFunction
            ? selectedFunction.options.name
            : i18n.translate('xpack.observabilityAiAssistant.prompt.callFunction', {
                defaultMessage: 'Call function',
              })}
        </EuiButtonEmpty>
      }
      closePopover={handleClickFunctionList}
      css={{ maxWidth: 400 }}
      panelPaddingSize="none"
      isOpen={isFunctionListOpen}
    >
      <EuiContextMenuPanel size="s">
        <EuiContextMenu
          initialPanelId={0}
          panels={[
            {
              id: 0,
              width: 500,
              items: functions.map((func) => ({
                name: (
                  <>
                    <EuiText size="s">
                      <p>
                        <strong>{func.options.name}</strong>
                      </p>
                    </EuiText>
                    <EuiSpacer size="xs" />
                    <EuiText size="s">
                      <p>{func.options.descriptionForUser}</p>
                    </EuiText>
                  </>
                ),
                onClick: () => handleSelectFunction(func),
              })),
            },
          ]}
        />
      </EuiContextMenuPanel>
    </EuiPopover>
  );
}
