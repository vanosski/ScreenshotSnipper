const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getScreenSourceId: () => ipcRenderer.invoke('get-screen-source-id'),
    saveCapture: (dataURL, defaultFilename) => ipcRenderer.invoke('save-capture', dataURL, defaultFilename),
    copyCapture: (dataURL) => ipcRenderer.invoke('copy-capture', dataURL),
    closeWindow: () => ipcRenderer.send('close-window') 
});