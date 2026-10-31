import { Client, Connection } from '@temporalio/client';
import { workflowId, taskQueue, normalizeSettings } from './shared.js';
const connection = await Connection.connect({
  address: process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233',
});
try {
  const client = new Client({ connection });
  const handle = client.workflow.getHandle(workflowId);
  const args = process.argv.slice(2);
  if (args.includes('--status')) console.log(JSON.stringify(await handle.query('status'), null, 2));
  else if (args.includes('--ask')) {
    await handle.signal('askGhost', args.slice(args.indexOf('--ask') + 1).join(' '));
    console.log('Question sent.');
  } else if (args.includes('--stop')) {
    await handle.cancel();
    console.log('Workflow cancellation requested.');
  } else {
    const settings = normalizeSettings({
      continueAfterMs: Number(process.env.CONTINUE_AFTER_MINUTES ?? 60) * 60000,
      stuckMs: Number(process.env.STUCK_MINUTES ?? 20) * 60000,
      hauntUntilHour: Number(process.env.HAUNT_UNTIL_HOUR ?? 5),
    });
    await client.workflow.start('glanceLoop', { taskQueue, workflowId, args: [{ settings }] });
    console.log(`Started ${workflowId}`);
  }
} finally {
  await connection.close();
}
