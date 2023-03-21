/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { BehaviorSubject, from } from 'rxjs';
import { map } from 'rxjs/operators';
import type { SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/public';
import type {
  AppDeepLink,
  AppMountParameters,
  AppUpdater,
  CoreSetup,
  CoreStart,
  Plugin as PluginClass,
  PluginInitializerContext,
} from '@kbn/core/public';
import { DEFAULT_APP_CATEGORIES, AppNavLinkStatus } from '@kbn/core/public';
import { CasesDeepLinkId, getCasesDeepLinks } from '@kbn/cases-plugin/public';
import type { DataPublicPluginSetup, DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { DiscoverStart } from '@kbn/discover-plugin/public';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { HomePublicPluginSetup, HomePublicPluginStart } from '@kbn/home-plugin/public';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { CasesUiStart } from '@kbn/cases-plugin/public';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type {
  TriggersAndActionsUIPublicPluginSetup,
  TriggersAndActionsUIPublicPluginStart,
} from '@kbn/triggers-actions-ui-plugin/public';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import type {
  ActionTypeRegistryContract,
  RuleTypeRegistryContract,
} from '@kbn/triggers-actions-ui-plugin/public';
import type { SecurityPluginStart } from '@kbn/security-plugin/public';
import type { GuidedOnboardingPluginStart } from '@kbn/guided-onboarding-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import { RuleDetailsLocatorDefinition } from '../routes/locators/rule_details';
import { registerDataHandler } from '../routes/pages/overview/helpers/data_handler';
import { createNavigationRegistry } from './navigation_registry/navigation_registry';
import type { NavigationEntry } from './navigation_registry/navigation_registry';
import { updateGlobalNavigation } from './navigation_registry/update_global_navigation';
import { createObservabilityRuleTypeRegistry } from './rule_registry/create_observability_rule_type_registry';
import type { ObservabilityRuleTypeRegistry } from './rule_registry/create_observability_rule_type_registry';
import { registerObservabilityRuleTypes } from './rule_registry/register_observability_rule_types';
import { createLazyObservabilityPageTemplate } from '../components/shared';
import { getExploratoryViewEmbeddable } from '../components/shared/exploratory_view/embeddable';
import { createExploratoryViewUrl } from '../components/shared/exploratory_view/configurations/exploratory_view_url';
import { createUseRulesLink } from '../hooks/create_use_rules_link';
import getAppDataView from '../utils/observability_data_views/get_app_data_view';
import { observabilityAppId, observabilityFeatureId } from '../../common';
import {
  ALERTS_URL,
  CASES_URL,
  OBSERVABILITY_BASE_PATH,
  OVERVIEW_URL,
  RULES_URL,
  SLOS_URL,
} from '../routes/routes';

export interface ObservabilityPublicPluginsSetup {
  data: DataPublicPluginSetup;
  share: SharePluginSetup;
  triggersActionsUi: TriggersAndActionsUIPublicPluginSetup;
  home?: HomePublicPluginSetup;
  usageCollection: UsageCollectionSetup;
}

export interface ObservabilityPublicPluginsStart {
  actionTypeRegistry: ActionTypeRegistryContract;
  cases: CasesUiStart;
  charts: ChartsPluginStart;
  data: DataPublicPluginStart;
  dataViews: DataViewsPublicPluginStart;
  discover: DiscoverStart;
  embeddable: EmbeddableStart;
  guidedOnboarding: GuidedOnboardingPluginStart;
  lens: LensPublicStart;
  licensing: LicensingPluginStart;
  kibanaVersion: string;
  ruleTypeRegistry: RuleTypeRegistryContract;
  security: SecurityPluginStart;
  share: SharePluginStart;
  spaces?: SpacesPluginStart;
  triggersActionsUi: TriggersAndActionsUIPublicPluginStart;
  usageCollection: UsageCollectionSetup;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  home?: HomePublicPluginStart;
  isDev?: boolean;
}

export type ObservabilityPublicSetup = ReturnType<Plugin['setup']>;
export type ObservabilityPublicStart = ReturnType<Plugin['start']>;

export class Plugin
  implements
    PluginClass<
      ObservabilityPublicSetup,
      ObservabilityPublicStart,
      ObservabilityPublicPluginsSetup,
      ObservabilityPublicPluginsStart
    >
{
  private readonly appUpdater$ = new BehaviorSubject<AppUpdater>(() => ({}));
  private readonly navigationRegistry = createNavigationRegistry();
  private observabilityRuleTypeRegistry: ObservabilityRuleTypeRegistry =
    {} as ObservabilityRuleTypeRegistry;

  // Define deep links as constant and hidden. Whether they are shown or hidden
  // in the global navigation will happen in `updateGlobalNavigation`.
  private readonly deepLinks: AppDeepLink[] = [
    {
      id: 'alerts',
      title: i18n.translate('xpack.observability.alertsLinkTitle', {
        defaultMessage: 'Alerts',
      }),
      order: 8001,
      path: ALERTS_URL,
      navLinkStatus: AppNavLinkStatus.hidden,
      deepLinks: [
        {
          id: 'rules',
          title: i18n.translate('xpack.observability.rulesLinkTitle', {
            defaultMessage: 'Rules',
          }),
          path: RULES_URL,
          navLinkStatus: AppNavLinkStatus.hidden,
        },
      ],
    },
    {
      id: 'slos',
      title: i18n.translate('xpack.observability.slosLinkTitle', {
        defaultMessage: 'SLOs',
      }),
      navLinkStatus: AppNavLinkStatus.hidden,
      order: 8002,
      path: SLOS_URL,
    },
    getCasesDeepLinks({
      basePath: CASES_URL,
      extend: {
        [CasesDeepLinkId.cases]: {
          order: 8003,
          navLinkStatus: AppNavLinkStatus.hidden,
        },
        [CasesDeepLinkId.casesCreate]: {
          navLinkStatus: AppNavLinkStatus.hidden,
          searchable: false,
        },
        [CasesDeepLinkId.casesConfigure]: {
          navLinkStatus: AppNavLinkStatus.hidden,
          searchable: false,
        },
      },
    }),
  ];

  constructor(private readonly initContext: PluginInitializerContext) {}

  public setup(
    coreSetup: CoreSetup<ObservabilityPublicPluginsStart, ObservabilityPublicStart>,
    pluginsSetup: ObservabilityPublicPluginsSetup
  ) {
    const category = DEFAULT_APP_CATEGORIES.observability;
    const euiIconType = 'logoObservability';
    const config = this.initContext.config.get();
    const kibanaVersion = this.initContext.env.packageInfo.version;

    this.observabilityRuleTypeRegistry = createObservabilityRuleTypeRegistry(
      pluginsSetup.triggersActionsUi.ruleTypeRegistry
    );
    pluginsSetup.share.url.locators.create(new RuleDetailsLocatorDefinition());

    const mount = async (params: AppMountParameters<unknown>) => {
      // Load application bundle
      const { renderApp } = await import('./application');
      // Get start services
      const [coreStart, pluginsStart, { navigation }] = await coreSetup.getStartServices();

      const { ruleTypeRegistry, actionTypeRegistry } = pluginsStart.triggersActionsUi;

      return renderApp({
        core: coreStart,
        config,
        plugins: { ...pluginsStart, ruleTypeRegistry, actionTypeRegistry },
        appMountParameters: params,
        observabilityRuleTypeRegistry: this.observabilityRuleTypeRegistry,
        ObservabilityPageTemplate: navigation.PageTemplate,
        usageCollection: pluginsSetup.usageCollection,
        isDev: this.initContext.env.mode.dev,
        kibanaVersion,
      });
    };

    const appUpdater$ = this.appUpdater$;
    const app = {
      appRoute: OBSERVABILITY_BASE_PATH,
      category,
      deepLinks: this.deepLinks,
      euiIconType,
      id: observabilityAppId,
      mount,
      order: 8000,
      title: i18n.translate('xpack.observability.overviewLinkTitle', {
        defaultMessage: 'Overview',
      }),
      updater$: appUpdater$,
      keywords: [
        'observability',
        'monitor',
        'logs',
        'metrics',
        'apm',
        'slo',
        'performance',
        'trace',
        'agent',
        'rum',
        'user',
        'experience',
      ],
    };

    coreSetup.application.register(app);

    registerObservabilityRuleTypes(config, this.observabilityRuleTypeRegistry);

    if (pluginsSetup.home) {
      pluginsSetup.home.featureCatalogue.registerSolution({
        id: observabilityFeatureId,
        title: i18n.translate('xpack.observability.featureCatalogueTitle', {
          defaultMessage: 'Observability',
        }),
        description: i18n.translate('xpack.observability.featureCatalogueDescription', {
          defaultMessage:
            'Consolidate your logs, metrics, application traces, and system availability with purpose-built UIs.',
        }),
        icon: 'logoObservability',
        path: '/app/observability/',
        order: 200,
      });
    }

    this.navigationRegistry.registerSections(
      from(appUpdater$).pipe(
        map((value) => {
          const deepLinks = value(app)?.deepLinks ?? [];

          const overviewLink = {
            label: i18n.translate('xpack.observability.overviewLinkTitle', {
              defaultMessage: 'Overview',
            }),
            app: observabilityAppId,
            path: OVERVIEW_URL,
          };

          // Reformat the visible links to be NavigationEntry objects instead of
          // AppDeepLink objects.
          //
          // In our case the deep links and sections being registered are the
          // same, and the logic to hide them based on flags or capabilities is
          // the same, so we just want to make a new list with the properties
          // needed by `registerSections`, which are different than the
          // properties used by the deepLinks.
          //
          // See https://github.com/elastic/kibana/issues/103325.
          const otherLinks: NavigationEntry[] = deepLinks
            .filter((link) => link.navLinkStatus === AppNavLinkStatus.visible)
            .map((link) => ({
              app: observabilityAppId,
              label: link.title,
              path: link.path ?? '',
              isBetaFeature: link.id === 'slos' ? true : false,
            }));

          const sections = [
            {
              label: '',
              sortKey: 100,
              entries: [overviewLink, ...otherLinks],
            },
          ];

          return sections;
        })
      )
    );

    return {
      dashboard: { register: registerDataHandler },
      observabilityRuleTypeRegistry: this.observabilityRuleTypeRegistry,
      navigation: {
        registerSections: this.navigationRegistry.registerSections,
      },
      useRulesLink: createUseRulesLink(),
    };
  }

  public start(coreStart: CoreStart, pluginsStart: ObservabilityPublicPluginsStart) {
    const { application } = coreStart;

    updateGlobalNavigation({
      capabilities: application.capabilities,
      deepLinks: this.deepLinks,
      updater$: this.appUpdater$,
    });

    const PageTemplate = createLazyObservabilityPageTemplate({
      currentAppId$: application.currentAppId$,
      getUrlForApp: application.getUrlForApp,
      navigateToApp: application.navigateToApp,
      navigationSections$: this.navigationRegistry.sections$,
      guidedOnboardingApi: pluginsStart.guidedOnboarding.guidedOnboardingApi,
      getPageTemplateServices: () => ({ coreStart }),
    });

    const getAsyncO11yAlertsTableConfiguration = async () => {
      const { getAlertsTableConfiguration } = await import(
        '../components/alerts_table/get_alerts_table_configuration'
      );
      return getAlertsTableConfiguration(this.observabilityRuleTypeRegistry);
    };

    const { alertsTableConfigurationRegistry } = pluginsStart.triggersActionsUi;

    getAsyncO11yAlertsTableConfiguration().then((alertsTableConfig) => {
      alertsTableConfigurationRegistry.register(alertsTableConfig);
    });

    return {
      observabilityRuleTypeRegistry: this.observabilityRuleTypeRegistry,
      navigation: {
        PageTemplate,
      },
      createExploratoryViewUrl,
      getAppDataView: getAppDataView(pluginsStart.dataViews),
      ExploratoryViewEmbeddable: getExploratoryViewEmbeddable({ ...coreStart, ...pluginsStart }),
      useRulesLink: createUseRulesLink(),
    };
  }
}
