const { contextBridge, ipcRenderer } = require('electron');
const listen = (channel) => (callback) => {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld('paperclip', {
  onCursor: listen('cursor'),
  onMode: listen('mode'),
  onMessage: listen('message'),
  onDemo: listen('demo'),
  onCaptureState: listen('capture:state'),
  onEnvironment: listen('environment'),
  setHover: (value) => ipcRenderer.send('hover', Boolean(value)),
  openCapture: () => ipcRenderer.send('capture:open'),
  setBounds: (b) => ipcRenderer.send('bounds', b),
  quit: () => ipcRenderer.send('quit'),
});
