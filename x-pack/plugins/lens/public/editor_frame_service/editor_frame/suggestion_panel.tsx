/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import './suggestion_panel.scss';

import { camelCase, pick } from 'lodash';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';
import useLocalStorage from 'react-use/lib/useLocalStorage';
import {
  EuiIcon,
  EuiTitle,
  EuiPanel,
  EuiIconTip,
  EuiToolTip,
  EuiButtonEmpty,
  EuiAccordion,
  EuiText,
  EuiNotificationBadge,
} from '@elastic/eui';
import { euiThemeVars } from '@kbn/ui-theme';
import { IconType } from '@elastic/eui/src/components/icon/icon';
import { Ast, fromExpression, toExpression } from '@kbn/interpreter';
import { i18n } from '@kbn/i18n';
import classNames from 'classnames';
import { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { ExecutionContextSearch } from '@kbn/es-query';
import {
  ReactExpressionRendererProps,
  ReactExpressionRendererType,
} from '@kbn/expressions-plugin/public';
import { reportPerformanceMetricEvent } from '@kbn/ebt-tools';
import { CoreStart } from '@kbn/core/public';
import { DONT_CLOSE_DIMENSION_CONTAINER_ON_CLICK_CLASS } from '../../utils';
import {
  Datasource,
  Visualization,
  FramePublicAPI,
  DatasourceMap,
  VisualizationMap,
  DatasourceLayers,
  UserMessagesGetter,
} from '../../types';
import { getSuggestions, switchToSuggestion } from './suggestion_helpers';
import { getDatasourceExpressionsByLayers } from './expression_helpers';
import { showMemoizedErrorNotification } from '../../lens_ui_errors/memoized_error_notification';
import { getMissingIndexPattern } from './state_helpers';
import {
  rollbackSuggestion,
  selectExecutionContextSearch,
  submitSuggestion,
  useLensDispatch,
  useLensSelector,
  selectCurrentVisualization,
  selectCurrentDatasourceStates,
  DatasourceStates,
  selectIsFullscreenDatasource,
  selectSearchSessionId,
  selectActiveDatasourceId,
  selectDatasourceStates,
  selectChangesApplied,
  applyChanges,
  selectStagedActiveData,
  selectFramePublicAPI,
} from '../../state_management';
import { filterAndSortUserMessages } from '../../app_plugin/get_application_user_messages';

const MAX_SUGGESTIONS_DISPLAYED = 5;
const LOCAL_STORAGE_SUGGESTIONS_PANEL = 'LENS_SUGGESTIONS_PANEL_HIDDEN';

const configurationsValid = (
  currentDataSource: Datasource | null,
  currentDatasourceState: unknown,
  currentVisualization: Visualization,
  currentVisualizationState: unknown,
  frame: FramePublicAPI
): boolean => {
  try {
    return (
      filterAndSortUserMessages(
        [
          ...(currentDataSource?.getUserMessages?.(currentDatasourceState, {
            frame,
            setState: () => {},
          }) ?? []),
          ...(currentVisualization?.getUserMessages?.(currentVisualizationState, { frame }) ?? []),
        ],
        undefined,
        { severity: 'error' }
      ).length === 0
    );
  } catch (e) {
    return false;
  }
};

export interface SuggestionPanelProps {
  datasourceMap: DatasourceMap;
  visualizationMap: VisualizationMap;
  ExpressionRenderer: ReactExpressionRendererType;
  frame: FramePublicAPI;
  getUserMessages?: UserMessagesGetter;
  nowProvider: DataPublicPluginStart['nowProvider'];
  core: CoreStart;
  showOnlyIcons?: boolean;
  wrapSuggestions?: boolean;
  isAccordionOpen?: boolean;
  toggleAccordionCb?: (flag: boolean) => void;
}

const PreviewRenderer = ({
  withLabel,
  ExpressionRendererComponent,
  expression,
  hasError,
  onRender,
}: {
  withLabel: boolean;
  expression: string | null | undefined;
  ExpressionRendererComponent: ReactExpressionRendererType;
  hasError: boolean;
  onRender: () => void;
}) => {
  const onErrorMessage = (
    <div className="lnsSuggestionPanel__suggestionIcon">
      <EuiIconTip
        size="xl"
        color="danger"
        type="warning"
        aria-label={i18n.translate('xpack.lens.editorFrame.previewErrorLabel', {
          defaultMessage: 'Preview rendering failed',
        })}
        content={i18n.translate('xpack.lens.editorFrame.previewErrorLabel', {
          defaultMessage: 'Preview rendering failed',
        })}
      />
    </div>
  );
  return (
    <div
      className={classNames('lnsSuggestionPanel__chartWrapper', {
        'lnsSuggestionPanel__chartWrapper--withLabel': withLabel,
      })}
    >
      {!expression || hasError ? (
        onErrorMessage
      ) : (
        <ExpressionRendererComponent
          className="lnsSuggestionPanel__expressionRenderer"
          padding="s"
          renderMode="preview"
          expression={expression}
          onRender$={onRender}
          debounce={2000}
          renderError={() => {
            return onErrorMessage;
          }}
        />
      )}
    </div>
  );
};

const SuggestionPreview = ({
  preview,
  ExpressionRenderer: ExpressionRendererComponent,
  selected,
  onSelect,
  showTitleAsLabel,
  onRender,
  wrapSuggestions,
}: {
  onSelect: () => void;
  preview: {
    expression?: Ast | null;
    icon: IconType;
    title: string;
    error?: boolean;
  };
  ExpressionRenderer: ReactExpressionRendererType;
  selected: boolean;
  showTitleAsLabel?: boolean;
  onRender: () => void;
  wrapSuggestions?: boolean;
}) => {
  return (
    <EuiToolTip
      content={preview.title}
      anchorProps={
        wrapSuggestions
          ? {
              css: css`
                display: flex;
                flex-direction: column;
                flex-basis: calc(50% - 9px);
              `,
            }
          : undefined
      }
    >
      <div data-test-subj={`lnsSuggestion-${camelCase(preview.title)}`}>
        <EuiPanel
          hasBorder={true}
          hasShadow={false}
          className={classNames('lnsSuggestionPanel__button', {
            'lnsSuggestionPanel__button-isSelected': selected,
            'lnsSuggestionPanel__button-fixedWidth': !wrapSuggestions,
          })}
          paddingSize="none"
          data-test-subj="lnsSuggestion"
          onClick={onSelect}
          aria-current={!!selected}
          aria-label={preview.title}
          element="button"
          role="listitem"
        >
          {preview.expression || preview.error ? (
            <PreviewRenderer
              ExpressionRendererComponent={ExpressionRendererComponent}
              expression={preview.expression && toExpression(preview.expression)}
              withLabel={Boolean(showTitleAsLabel)}
              hasError={Boolean(preview.error)}
              onRender={onRender}
            />
          ) : (
            <span className="lnsSuggestionPanel__suggestionIcon">
              <EuiIcon size="xxl" type={preview.icon} />
            </span>
          )}
          {showTitleAsLabel && (
            <span className="lnsSuggestionPanel__buttonLabel">{preview.title}</span>
          )}
        </EuiPanel>
      </div>
    </EuiToolTip>
  );
};

export const SuggestionPanelWrapper = (props: SuggestionPanelProps) => {
  const isFullscreenDatasource = useLensSelector(selectIsFullscreenDatasource);
  return isFullscreenDatasource ? null : <SuggestionPanel {...props} />;
};

export function SuggestionPanel({
  datasourceMap,
  visualizationMap,
  frame,
  ExpressionRenderer: ExpressionRendererComponent,
  getUserMessages,
  nowProvider,
  core,
  showOnlyIcons,
  wrapSuggestions,
  toggleAccordionCb,
  isAccordionOpen,
}: SuggestionPanelProps) {
  const dispatchLens = useLensDispatch();
  const activeDatasourceId = useLensSelector(selectActiveDatasourceId);
  const activeData = useLensSelector(selectStagedActiveData);
  const datasourceStates = useLensSelector(selectDatasourceStates);
  const existsStagedPreview = useLensSelector((state) => Boolean(state.lens.stagedPreview));
  const currentVisualization = useLensSelector(selectCurrentVisualization);
  const currentDatasourceStates = useLensSelector(selectCurrentDatasourceStates);

  const framePublicAPI = useLensSelector((state) => selectFramePublicAPI(state, datasourceMap));
  const changesApplied = useLensSelector(selectChangesApplied);
  // get user's selection from localStorage, this key defines if the suggestions panel will be hidden or not
  const initialAccordionStatusValue =
    typeof isAccordionOpen !== 'undefined' ? !Boolean(isAccordionOpen) : false;
  const [hideSuggestions, setHideSuggestions] = useLocalStorage(
    LOCAL_STORAGE_SUGGESTIONS_PANEL,
    initialAccordionStatusValue
  );
  useEffect(() => {
    if (typeof isAccordionOpen !== 'undefined') {
      setHideSuggestions(!Boolean(isAccordionOpen));
    }
  }, [isAccordionOpen, setHideSuggestions]);

  const toggleSuggestions = useCallback(() => {
    setHideSuggestions(!hideSuggestions);
    toggleAccordionCb?.(!hideSuggestions);
  }, [setHideSuggestions, hideSuggestions, toggleAccordionCb]);

  const missingIndexPatterns = getMissingIndexPattern(
    activeDatasourceId ? datasourceMap[activeDatasourceId] : null,
    activeDatasourceId ? datasourceStates[activeDatasourceId] : null,
    frame.dataViews.indexPatterns
  );
  const { suggestions, currentStateExpression, currentStateError } = useMemo(() => {
    const newSuggestions = missingIndexPatterns.length
      ? []
      : getSuggestions({
          datasourceMap,
          datasourceStates: currentDatasourceStates,
          visualizationMap,
          activeVisualization: currentVisualization.activeId
            ? visualizationMap[currentVisualization.activeId]
            : undefined,
          visualizationState: currentVisualization.state,
          activeData,
          dataViews: frame.dataViews,
        })
          .filter(
            ({
              hide,
              visualizationId,
              visualizationState: suggestionVisualizationState,
              datasourceState: suggestionDatasourceState,
              datasourceId: suggestionDatasourceId,
            }) => {
              return (
                !hide &&
                configurationsValid(
                  suggestionDatasourceId ? datasourceMap[suggestionDatasourceId] : null,
                  suggestionDatasourceState,
                  visualizationMap[visualizationId],
                  suggestionVisualizationState,
                  framePublicAPI
                )
              );
            }
          )
          .slice(0, MAX_SUGGESTIONS_DISPLAYED)
          .map((suggestion) => ({
            ...suggestion,
            previewExpression: preparePreviewExpression(
              suggestion,
              visualizationMap[suggestion.visualizationId],
              datasourceMap,
              currentDatasourceStates,
              frame,
              nowProvider
            ),
          }));

    const hasErrors = getUserMessages
      ? getUserMessages(['visualization', 'visualizationInEditor'], { severity: 'error' }).length >
        0
      : false;

    const newStateExpression =
      currentVisualization.state && currentVisualization.activeId && !hasErrors
        ? preparePreviewExpression(
            { visualizationState: currentVisualization.state },
            visualizationMap[currentVisualization.activeId],
            datasourceMap,
            currentDatasourceStates,
            frame,
            nowProvider
          )
        : undefined;

    return {
      suggestions: newSuggestions,
      currentStateExpression: newStateExpression,
      currentStateError: hasErrors,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentDatasourceStates,
    currentVisualization.state,
    currentVisualization.activeId,
    activeDatasourceId,
    datasourceMap,
    visualizationMap,
    activeData,
  ]);

  const context: ExecutionContextSearch = useLensSelector(selectExecutionContextSearch);
  const searchSessionId = useLensSelector(selectSearchSessionId);

  const contextRef = useRef<ExecutionContextSearch>(context);
  contextRef.current = context;

  const sessionIdRef = useRef<string>(searchSessionId);
  sessionIdRef.current = searchSessionId;

  const AutoRefreshExpressionRenderer = useMemo(() => {
    return (props: ReactExpressionRendererProps) => (
      <ExpressionRendererComponent
        {...props}
        searchContext={contextRef.current}
        searchSessionId={sessionIdRef.current}
      />
    );
  }, [ExpressionRendererComponent]);

  const [lastSelectedSuggestion, setLastSelectedSuggestion] = useState<number>(-1);

  useEffect(() => {
    // if the staged preview is overwritten by a suggestion,
    // reset the selected index to "current visualization" because
    // we are not in transient suggestion state anymore
    if (!existsStagedPreview && lastSelectedSuggestion !== -1) {
      setLastSelectedSuggestion(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existsStagedPreview]);

  const startTime = useRef<number>(0);
  const initialRenderComplete = useRef<boolean>(false);
  const suggestionsRendered = useRef<boolean[]>([]);
  const totalSuggestions = suggestions.length + 1;

  const onSuggestionRender = useCallback(
    (suggestionIndex: number) => {
      suggestionsRendered.current[suggestionIndex] = true;
      if (initialRenderComplete.current === false && suggestionsRendered.current.every(Boolean)) {
        initialRenderComplete.current = true;
        reportPerformanceMetricEvent(core.analytics, {
          eventName: 'lensSuggestionsRenderTime',
          duration: performance.now() - startTime.current,
        });
      }
    },
    [core.analytics]
  );

  const rollbackToCurrentVisualization = useCallback(() => {
    if (lastSelectedSuggestion !== -1) {
      setLastSelectedSuggestion(-1);
      dispatchLens(rollbackSuggestion());
      dispatchLens(applyChanges());
    }
  }, [dispatchLens, lastSelectedSuggestion]);

  if (!activeDatasourceId) {
    return null;
  }

  if (suggestions.length === 0) {
    return null;
  }

  const renderApplyChangesPrompt = () => (
    <EuiPanel hasShadow={false} className="lnsSuggestionPanel__applyChangesPrompt" paddingSize="m">
      <EuiText size="s" color="subdued" className="lnsSuggestionPanel__applyChangesMessage">
        <p>
          <FormattedMessage
            id="xpack.lens.suggestions.applyChangesPrompt"
            defaultMessage="Latest changes must be applied to view suggestions."
          />
        </p>
      </EuiText>

      <EuiButtonEmpty
        iconType="checkInCircleFilled"
        size="s"
        className={DONT_CLOSE_DIMENSION_CONTAINER_ON_CLICK_CLASS}
        onClick={() => dispatchLens(applyChanges())}
        data-test-subj="lnsApplyChanges__suggestions"
      >
        <FormattedMessage
          id="xpack.lens.suggestions.applyChangesLabel"
          defaultMessage="Apply changes"
        />
      </EuiButtonEmpty>
    </EuiPanel>
  );

  const renderSuggestionsUI = () => {
    suggestionsRendered.current = new Array(totalSuggestions).fill(false);
    startTime.current = performance.now();
    return (
      <>
        {currentVisualization.activeId && !hideSuggestions && (
          <SuggestionPreview
            preview={{
              error: currentStateError,
              expression: !showOnlyIcons ? currentStateExpression : undefined,
              icon:
                visualizationMap[currentVisualization.activeId].getDescription(
                  currentVisualization.state
                ).icon || 'empty',
              title: i18n.translate('xpack.lens.suggestions.currentVisLabel', {
                defaultMessage: 'Current visualization',
              }),
            }}
            ExpressionRenderer={AutoRefreshExpressionRenderer}
            onSelect={rollbackToCurrentVisualization}
            selected={lastSelectedSuggestion === -1}
            showTitleAsLabel
            onRender={() => onSuggestionRender(0)}
            wrapSuggestions={wrapSuggestions}
          />
        )}
        {!hideSuggestions &&
          suggestions.map((suggestion, index) => {
            return (
              <SuggestionPreview
                preview={{
                  expression: !showOnlyIcons ? suggestion.previewExpression : undefined,
                  icon: suggestion.previewIcon,
                  title: suggestion.title,
                }}
                ExpressionRenderer={AutoRefreshExpressionRenderer}
                key={index}
                onSelect={() => {
                  if (lastSelectedSuggestion === index) {
                    rollbackToCurrentVisualization();
                  } else {
                    setLastSelectedSuggestion(index);
                    switchToSuggestion(dispatchLens, suggestion, { applyImmediately: true });
                  }
                }}
                selected={index === lastSelectedSuggestion}
                onRender={() => onSuggestionRender(index + 1)}
                showTitleAsLabel={showOnlyIcons}
                wrapSuggestions={wrapSuggestions}
              />
            );
          })}
      </>
    );
  };
  const title = (
    <EuiTitle
      size="xxs"
      css={css`
    padding: 2px;
  }
`}
    >
      <h3>
        <FormattedMessage
          id="xpack.lens.editorFrame.suggestionPanelTitle"
          defaultMessage="Suggestions"
        />
      </h3>
    </EuiTitle>
  );
  return (
    <EuiAccordion
      id="lensSuggestionsPanel"
      buttonProps={{
        'data-test-subj': 'lensSuggestionsPanelToggleButton',
        paddingSize: wrapSuggestions ? 'm' : 's',
      }}
      className="lnsSuggestionPanel"
      css={css`
        padding-bottom: ${wrapSuggestions ? 0 : euiThemeVars.euiSizeS};
      `}
      buttonContent={title}
      forceState={hideSuggestions ? 'closed' : 'open'}
      onToggle={toggleSuggestions}
      extraAction={
        <>
          {!hideSuggestions && (
            <>
              {existsStagedPreview && (
                <EuiToolTip
                  content={i18n.translate('xpack.lens.suggestion.refreshSuggestionTooltip', {
                    defaultMessage: 'Refresh the suggestions based on the selected visualization.',
                  })}
                >
                  <EuiButtonEmpty
                    data-test-subj="lensSubmitSuggestion"
                    size="xs"
                    iconType="refresh"
                    onClick={() => {
                      dispatchLens(submitSuggestion());
                    }}
                  >
                    {i18n.translate('xpack.lens.sugegstion.refreshSuggestionLabel', {
                      defaultMessage: 'Refresh',
                    })}
                  </EuiButtonEmpty>
                </EuiToolTip>
              )}
            </>
          )}
          {wrapSuggestions && (
            <EuiNotificationBadge size="m" color="subdued">
              {suggestions.length + 1}
            </EuiNotificationBadge>
          )}
        </>
      }
    >
      <div
        className="lnsSuggestionPanel__suggestions"
        data-test-subj="lnsSuggestionsPanel"
        role="list"
        tabIndex={0}
        css={css`
          flex-wrap: ${wrapSuggestions ? 'wrap' : 'nowrap'};
          gap: ${wrapSuggestions ? euiThemeVars.euiSize : 0};
        `}
      >
        {changesApplied ? renderSuggestionsUI() : renderApplyChangesPrompt()}
      </div>
    </EuiAccordion>
  );
}

interface VisualizableState {
  visualizationState: unknown;
  datasourceState?: unknown;
  datasourceId?: string;
  keptLayerIds?: string[];
}

function getPreviewExpression(
  visualizableState: VisualizableState,
  visualization: Visualization,
  datasources: Record<string, Datasource>,
  datasourceStates: DatasourceStates,
  frame: FramePublicAPI,
  nowProvider: DataPublicPluginStart['nowProvider']
) {
  if (!visualization.toPreviewExpression) {
    return null;
  }

  const suggestionFrameApi: Pick<FramePublicAPI, 'datasourceLayers' | 'activeData'> = {
    datasourceLayers: { ...frame.datasourceLayers },
  };
  try {
    // use current frame api and patch apis for changed datasource layers
    if (
      visualizableState.keptLayerIds &&
      visualizableState.datasourceId &&
      visualizableState.datasourceState
    ) {
      const datasource = datasources[visualizableState.datasourceId];
      const datasourceState = visualizableState.datasourceState;
      const updatedLayerApis: DatasourceLayers = pick(
        frame.datasourceLayers,
        visualizableState.keptLayerIds
      );
      const changedLayers = datasource.getLayers(visualizableState.datasourceState);
      changedLayers.forEach((layerId) => {
        if (updatedLayerApis[layerId]) {
          updatedLayerApis[layerId] = datasource.getPublicAPI({
            layerId,
            state: datasourceState,
            indexPatterns: frame.dataViews.indexPatterns,
          });
        }
      });
    }

    const datasourceExpressionsByLayers = getDatasourceExpressionsByLayers(
      datasources,
      datasourceStates,
      frame.dataViews.indexPatterns,
      frame.dateRange,
      nowProvider.get()
    );

    return visualization.toPreviewExpression(
      visualizableState.visualizationState,
      suggestionFrameApi.datasourceLayers,
      datasourceExpressionsByLayers ?? undefined
    );
  } catch (error) {
    showMemoizedErrorNotification(error);
    return null;
  }
}

function preparePreviewExpression(
  visualizableState: VisualizableState,
  visualization: Visualization,
  datasourceMap: DatasourceMap,
  datasourceStates: DatasourceStates,
  framePublicAPI: FramePublicAPI,
  nowProvider: DataPublicPluginStart['nowProvider']
) {
  const suggestionDatasourceId = visualizableState.datasourceId;
  const suggestionDatasourceState = visualizableState.datasourceState;

  const datasourceStatesWithSuggestions = suggestionDatasourceId
    ? {
        ...datasourceStates,
        [suggestionDatasourceId]: {
          isLoading: false,
          state: suggestionDatasourceState,
        },
      }
    : datasourceStates;

  const expression = getPreviewExpression(
    visualizableState,
    visualization,
    datasourceMap,
    datasourceStatesWithSuggestions,
    framePublicAPI,
    nowProvider
  );

  if (!expression) {
    return;
  }

  return typeof expression === 'string' ? fromExpression(expression) : expression;
}
