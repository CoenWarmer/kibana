/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { i18n } from '@kbn/i18n';
import { CoreSetup, Plugin } from '@kbn/core/public';
import { ManagementSetup } from '@kbn/management-plugin/public';
import { HomePublicPluginSetup } from '@kbn/home-plugin/public';
import { ServerlessPluginSetup } from '@kbn/serverless/public';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AiAssistantManagementPluginSetup {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AiAssistantManagementPluginStart {}

export interface SetupDependencies {
  management: ManagementSetup;
  home?: HomePublicPluginSetup;
  serverless?: ServerlessPluginSetup;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StartDependencies {}

export class AiAssistantManagementPlugin
  implements
    Plugin<
      AiAssistantManagementPluginSetup,
      AiAssistantManagementPluginStart,
      SetupDependencies,
      StartDependencies
    >
{
  public setup(
    core: CoreSetup<StartDependencies, AiAssistantManagementPluginStart>,
    { home, management, serverless }: SetupDependencies
  ): AiAssistantManagementPluginSetup {
    if (serverless) return {};

    if (home) {
      home.featureCatalogue.register({
        id: 'ai_assistant',
        title: i18n.translate('aiAssistantManagement.app.title', {
          defaultMessage: 'AI Assistants',
        }),
        description: i18n.translate('aiAssistantManagement.app.description', {
          defaultMessage: 'Manage your AI Assistants.',
        }),
        icon: 'sparkles',
        path: '/app/management/kibana/ai-assistant',
        showOnHomePage: false,
        category: 'admin',
      });
    }

    management.sections.section.kibana.registerApp({
      id: 'aiAssistantManagement',
      title: i18n.translate('aiAssistantManagement.managementSectionLabel', {
        defaultMessage: 'AI Assistants',
      }),
      order: 1,
      mount: async (mountParams) => {
        const { mountManagementSection } = await import('./management_section/mount_section');

        return mountManagementSection({
          core,
          mountParams,
        });
      },
    });

    return {};
  }

  public start() {
    return {};
  }
}
