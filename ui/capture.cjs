const { BrowserWindow, desktopCapturer, session, screen, ipcMain } = require('electron');
const { randomBytes } = require('node:crypto');
const { mkdirSync, writeFileSync, chmodSync, unlinkSync } = require('node:fs');
const path = require('node:path');
const { createCaptureServer } = require('./capture-server.cjs');
function createCaptureController(onState = () => {}) {
  const stateListener = (event, state) => {
    if (
      window &&
      !window.isDestroyed() &&
      event.sender === window.webContents &&
      ['idle', 'requesting', 'sharing', 'error'].includes(state)
    )
      onState(state);
  };
  ipcMain.on('capture:state', stateListener);
  let window, server;
  const token = randomBytes(32).toString('hex');
  const tokenPath = path.join(__dirname, '../.runtime/capture-token');
  const captureSession = session.fromPartition('paperclip-capture');
  const authorized = (request) =>
    window && !window.isDestroyed() && request.frame === window.webContents.mainFrame;
  captureSession.setPermissionCheckHandler(
    (contents, permission) => contents === window?.webContents && permission === 'display-capture',
  );
  captureSession.setPermissionRequestHandler((contents, permission, callback) =>
    callback(contents === window?.webContents && permission === 'display-capture'),
  );
  captureSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!authorized(request)) return callback({});
    try {
      // Under PipeWire this opens the compositor's source chooser. On X11 the dedicated
      // Start sharing button grants the primary screen only; no audio is requested.
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
      });
      const source =
        sources.find((s) => s.display_id === String(screen.getPrimaryDisplay().id)) ?? sources[0];
      callback(source ? { video: source } : {});
    } catch {
      callback({});
    }
  });
  function open() {
    if (window && !window.isDestroyed()) {
      window.show();
      window.focus();
      return;
    }
    window = new BrowserWindow({
      width: 800,
      height: 850,
      minWidth: 420,
      minHeight: 540,
      backgroundColor: '#14161b',
      title: 'Wisp · Screen sharing',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'capture-preload.cjs'),
        session: captureSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (e) => e.preventDefault());
    window.loadFile(path.join(__dirname, 'capture.html'));
    window.on('closed', () => onState('idle'));
    // Closing the window destroys the stream. Minimize it to keep sharing.
  }
  server = createCaptureServer(token, async () => {
    if (!window || window.isDestroyed()) throw new Error('No sharing session');
    return window.webContents.executeJavaScript('window.captureFrame()');
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.on('error', (error) => console.error('Capture bridge:', error.code));
  server.listen(47832, '127.0.0.1', () => {
    mkdirSync(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
    chmodSync(path.dirname(tokenPath), 0o700);
    writeFileSync(tokenPath, token, { mode: 0o600 });
    chmodSync(tokenPath, 0o600);
  });
  return {
    open,
    close() {
      ipcMain.removeListener('capture:state', stateListener);
      server.close();
      server.closeAllConnections();
      if (window && !window.isDestroyed()) window.destroy();
      try {
        unlinkSync(tokenPath);
      } catch {}
    },
  };
}
module.exports = { createCaptureController };
