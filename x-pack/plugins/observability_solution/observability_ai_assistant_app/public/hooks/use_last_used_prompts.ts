/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uniq } from 'lodash';
import { useKibana } from './use_kibana';

const AI_ASSISTANT_LAST_USED_PROMPT_STORAGE = 'ai-assistant-last-used-prompts';

export function useLastUsedPrompts() {
  const { storage } = useKibana().services;

  const previousPrompts = (storage.get(AI_ASSISTANT_LAST_USED_PROMPT_STORAGE) as string[]) ?? [];

  return {
    previousPrompts,
    addLastUsed: (prompt: string) => {
      storage.set(
        AI_ASSISTANT_LAST_USED_PROMPT_STORAGE,
        uniq([prompt, ...previousPrompts]).slice(0, 5)
      );
    },
  };
}
