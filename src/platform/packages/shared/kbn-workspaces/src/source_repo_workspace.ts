/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { AbstractWorkspace } from './abstract_workspace';
import type { SourceRepoWorkspaceState, WorkspaceGlobalContext, WorkspaceState } from './types';
import { getRef } from './utils/get_ref';
import { getSha } from './utils/get_sha';
import type { WorkspaceController } from './workspace_controller';

export class SourceRepoWorkspace extends AbstractWorkspace {
  constructor(
    private readonly sourceRepoState: SourceRepoWorkspaceState,
    controller: WorkspaceController,
    context: WorkspaceGlobalContext
  ) {
    super(
      {
        dir: sourceRepoState.dir,
        tasks: sourceRepoState.tasks,
      },
      controller,
      context
    );
  }

  protected async getCacheKey(): Promise<string> {
    const ref = await getRef(this.dir());
    const sha = await getSha(this.dir(), ref);

    return sha;
  }

  protected getState(): WorkspaceState {
    return this.sourceRepoState;
  }

  public getDisplayName(): string {
    return 'cwd';
  }
}
