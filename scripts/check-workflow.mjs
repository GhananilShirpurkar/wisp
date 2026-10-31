import { bundleWorkflowCode } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
await bundleWorkflowCode({
  workflowsPath: fileURLToPath(new URL('../dist/workflows.js', import.meta.url)),
});
