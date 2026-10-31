import { createConnection } from 'node:net';
import { setTimeout } from 'node:timers/promises';
const effects = ['splatter', 'lightning', 'shiver', 'candle', 'ink'];
const arg = process.argv[2] ?? 'all';
for (const effect of arg === 'all' ? effects : [arg]) {
  if (!effects.includes(effect)) throw new Error('Unknown effect');
  await new Promise((resolve, reject) => {
    const s = createConnection({ host: '127.0.0.1', port: 47831 }, () =>
      s.end(JSON.stringify({ type: 'demo', effect }) + '\n'),
    );
    s.on('error', reject);
    s.on('close', resolve);
    s.resume();
  });
  console.log(effect);
  await setTimeout(2000);
}
