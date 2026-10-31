const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('captureUI', {
  setState: (state) => {
    if (['idle', 'requesting', 'sharing', 'error'].includes(state))
      ipcRenderer.send('capture:state', state);
  },
});
