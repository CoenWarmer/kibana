# @kbn/clone-workspace

Utility for preparing a temporary Kibana workspace at a specific git ref for build or analysis tasks (e.g. bundle size comparison).

## Usage

```ts
import { cloneWorkspace } from '@kbn/clone-workspace';

const { dest } = await cloneWorkspace({
  ref: 'origin/main',
  log, // ToolingLog instance
  force: false, // optional, force checkout + force install
  tmpDir: undefined, // optional explicit path; otherwise OS temp is used
});

// run commands in `dest`
```

## API

`cloneWorkspace(options)`

- `ref`: branch/tag/SHA to checkout
- `force` (optional): force checkout (discard changes) and force install during bootstrap
- `tmpDir` (optional): destination directory to (re)use
- `log`: ToolingLog for output

Returns: `{ dest: string }`: absolute path to the prepared working copy.

Idempotent: if the destination exists it is fetched/updated instead of recloned.
