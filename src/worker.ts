import { NativeConnection, Worker } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
import * as activities from './activities.js';
import { taskQueue } from './shared.js';
import { initTelemetry } from './telemetry.js';
initTelemetry();
const connection = await NativeConnection.connect({
  address: process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233',
});
try {
  const worker = await Worker.create({
    connection,
    workflowsPath: fileURLToPath(new URL('./workflows.js', import.meta.url)),
    activities,
    taskQueue,
  });
  await worker.run();
} finally {
  await connection.close();
}
