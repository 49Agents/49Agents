import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getState: ()        => ipcRenderer.invoke('get-state'),
  getLogs:  (service) => ipcRenderer.invoke('get-logs', service),
  action:   (name)    => ipcRenderer.invoke('action', name),
  onState:  (cb)      => ipcRenderer.on('state', (_e, s)     => cb(s)),
  onLog:    (cb)      => ipcRenderer.on('log',   (_e, entry) => cb(entry)),
  ready:    ()        => ipcRenderer.send('dashboard-ready'),
});
