const { createServer } = require('node:http');
const { timingSafeEqual } = require('node:crypto');
function createCaptureServer(token, capture) {
  let busy = false;
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    const supplied = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.writeHead(401);
      return response.end('{"error":"Unauthorized"}');
    }
    if (request.method !== 'POST' || request.url !== '/capture') {
      response.writeHead(404);
      return response.end('{}');
    }
    if (busy) {
      response.writeHead(429);
      return response.end('{"error":"Busy"}');
    }
    busy = true;
    let timer;
    try {
      const image = await Promise.race([
        capture(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), 8000);
        }),
      ]);
      if (
        typeof image !== 'string' ||
        image.length > 4000000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(image)
      )
        throw new Error('Invalid frame');
      response.end(JSON.stringify({ image }));
    } catch {
      response.writeHead(409);
      response.end('{"error":"Screen sharing is not active"}');
    } finally {
      clearTimeout(timer);
      busy = false;
    }
  });
}
module.exports = { createCaptureServer };
