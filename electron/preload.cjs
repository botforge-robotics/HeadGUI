const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Serial/UART communication
    serial: {
        listPorts: () => ipcRenderer.invoke('serial:list'),
        connect: (port) => ipcRenderer.invoke('serial:connect', port),
        disconnect: () => ipcRenderer.invoke('serial:disconnect'),
        send: (data) => ipcRenderer.invoke('serial:send', data),
        onData: (callback) => ipcRenderer.on('serial:data', (_, data) => callback(data)),
        onStatus: (callback) => ipcRenderer.on('serial:status', (_, status) => callback(status)),
    },

    // IP/WebSocket (placeholder for future)
    network: {
        connect: (ip, port) => ipcRenderer.invoke('network:connect', ip, port),
        disconnect: () => ipcRenderer.invoke('network:disconnect'),
        send: (data) => ipcRenderer.invoke('network:send', data),
    },

    // Store management
    store: {
        get: (key) => ipcRenderer.invoke('store:get', key),
        set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    },
});
