/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { bootstrap } from './bootstrap';
import type {
  IWorkspace,
  WorkspaceGlobalContext,
  WorkspaceState,
  WorkspaceTasksState,
} from './types';
import type { WorkspaceController } from './workspace_controller';

interface AbstractWorkspaceState {
  dir: string;
  tasks: WorkspaceTasksState;
}

export abstract class AbstractWorkspace implements IWorkspace {
  constructor(
    protected readonly state: AbstractWorkspaceState,
    protected readonly controller: WorkspaceController,
    protected readonly context: WorkspaceGlobalContext
  ) {}

  protected abstract getCacheKey(): Promise<string>;

  protected abstract getState(): WorkspaceState;

  public abstract getDisplayName(): string;

  public getDir(): string {
    return this.state.dir;
  }

  async ensureBootstrap(): Promise<void> {
    const cacheKey = await this.getCacheKey();

    if (this.state.tasks.bootstrap?.cacheKey === cacheKey) {
      return;
    }

    await this.ensureCheckout();

    await bootstrap({
      log: this.context.log,
      dir: this.state.dir,
    });

    await this.controller.updateEntry(this.getState(), (e) => {
      e.tasks.bootstrap = { cacheKey };
      e.tasks.build = null;
    });
  }

  async ensureBuild(): Promise<void> {}

  async ensureCheckout(): Promise<void> {}
}
