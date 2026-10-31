const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage } = require('electron');
const path = require('node:path');
app.setName('Wisp');
const { createCaptureController } = require('./capture.cjs');
// Global cursor coordinates and overlay positioning require X11/XWayland.
if (process.platform === 'linux' && process.env.DISPLAY)
  app.commandLine.appendSwitch('ozone-platform', 'x11');
const { createOverlayTcpGate } = require('./bridge.cjs');
const demo = process.argv.includes('--demo');
if (process.platform === 'linux' && process.env.WAYLAND_DISPLAY)
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
let win, server, timer, tray, capture;
let hitBounds = null,
  interactive = false,
  captureState = 'idle';
if (!app.requestSingleInstanceLock()) app.quit();
else
  app.whenReady().then(() => {
    const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
    win = new BrowserWindow({
      x,
      y,
      width,
      height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: !demo,
      resizable: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setIgnoreMouseEvents(true, { forward: true });
    if (process.platform === 'linux' && !demo)
      capture = createCaptureController((state) => {
        captureState = state;
        if (!win.isDestroyed()) win.webContents.send('capture:state', state);
      });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_w, _p, callback) => callback(false));
    win.loadFile(path.join(__dirname, 'index.html'));
    const send = (channel, value) => {
      if (!win.isDestroyed()) win.webContents.send(channel, value);
    };
    ipcMain.on('capture:open', (event) => {
      if (event.sender === win.webContents) capture?.open();
    });
    ipcMain.on('bounds', (event, b) => {
      if (
        event.sender === win.webContents &&
        b &&
        ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(b[k])) &&
        b.width >= 0 &&
        b.height >= 0
      )
        hitBounds = b;
    });
    ipcMain.on('hover', (event, value) => {
      if (
        process.platform !== 'linux' &&
        event.sender === win.webContents &&
        typeof value === 'boolean'
      )
        win.setIgnoreMouseEvents(!value, { forward: true });
    });
    ipcMain.on('quit', (event) => {
      if (event.sender === win.webContents) app.quit();
    });
    server = createOverlayTcpGate((c) => send(c.type, c));
    server.on('error', (error) => {
      console.error('Overlay listener:', error.code);
      app.quit();
    });
    server.listen(47831, '127.0.0.1');
    timer = setInterval(() => {
      const pt = screen.getCursorScreenPoint();
      const bounds = win.getBounds();
      const local = { x: pt.x - bounds.x, y: pt.y - bounds.y };
      send('cursor', local);
      if (process.platform === 'linux' && hitBounds) {
        const b = hitBounds;
        const over =
          local.x >= b.x && local.x <= b.x + b.width && local.y >= b.y && local.y <= b.y + b.height;
        if (over !== interactive) {
          interactive = over;
          win.setIgnoreMouseEvents(!over);
        }
      }
    }, 50);
    const icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    );
    tray = new Tray(icon);
    tray.setToolTip('Wisp');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Screen sharing…',
          enabled: !demo && process.platform === 'linux',
          click: () => capture?.open(),
        },
        {
          label: 'Say hello',
          click: () => send('message', { text: 'Still here. Still haunting.', kind: 'help' }),
        },
        {
          label: 'Toggle possessed mode',
          type: 'checkbox',
          click: (item) => send('mode', { possessed: item.checked }),
        },
        { label: 'Quit overlay', click: () => app.quit() },
      ]),
    );
    win.webContents.once('did-finish-load', () => {
      send('environment', { demo, captureSupported: process.platform === 'linux' });
      send('capture:state', captureState);
      send('message', {
        text: demo
          ? 'A little company, a little mischief. Click me to explore. This demo never sees your screen.'
          : 'Ready when you are. Click me to choose what I can see.',
        kind: 'help',
      });
    });
  });
app.on('before-quit', () => {
  clearInterval(timer);
  server?.close();
  tray?.destroy();
  capture?.close();
});
app.on('window-all-closed', () => app.quit());
