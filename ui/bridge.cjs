const { createServer } = require('node:net');
const effects = ['splatter', 'lightning', 'shiver', 'candle', 'ink'];
function validateCommand(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  if (c.force !== undefined && typeof c.force !== 'boolean') return false;
  if (c.type === 'message')
    return (
      typeof c.text === 'string' &&
      c.text.length <= 2000 &&
      ['quiet', 'help', 'haunt', undefined].includes(c.kind)
    );
  if (c.type === 'mode') return typeof c.possessed === 'boolean';
  return c.type === 'demo' && effects.includes(c.effect);
}
function createOverlayTcpGate(onCommand, { cooldownMs = 180000, now = Date.now } = {}) {
  let last = -Infinity;
  return createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.setTimeout(5000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 16384) return socket.destroy();
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          const command = JSON.parse(line);
          if (!validateCommand(command)) continue;
          const time = now();
          if (command.type === 'message') {
            if (!command.force && time - last < cooldownMs) continue;
            last = time;
          }
          onCommand(command);
        } catch {
          /* malformed frames are discarded */
        }
      }
    });
  });
}
module.exports = { validateCommand, createOverlayTcpGate };
