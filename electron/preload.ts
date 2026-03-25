import { contextBridge, ipcRenderer } from 'electron';

// ---------------------------------------------------------------------------
// Expose APIs to renderer via window.electron
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld('electron', {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  resizeToMobile: () => ipcRenderer.invoke('window:resizeToMobile'),
  resizeToDesktop: () => ipcRenderer.invoke('window:resizeToDesktop'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // File system (for IDE file explorer)
  fs: {
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    watchDir: (dirPath: string) => {
      ipcRenderer.send('fs:watchDir', dirPath);
      return {
        onEvent: (callback: (event: string, path: string) => void) => {
          const handler = (_: unknown, ev: string, p: string) => callback(ev, p);
          ipcRenderer.on('fs:watchEvent', handler);
          return () => ipcRenderer.removeListener('fs:watchEvent', handler);
        },
        stop: () => ipcRenderer.send('fs:unwatchDir', dirPath),
      };
    },
  },

  // Docker (for container management panel)
  docker: {
    listContainers: () => ipcRenderer.invoke('docker:listContainers'),
    containerStats: (id: string) => ipcRenderer.invoke('docker:containerStats', id),
    containerLogs: (id: string, tail?: number) =>
      ipcRenderer.invoke('docker:containerLogs', id, tail),
    containerAction: (id: string, action: 'start' | 'stop' | 'restart') =>
      ipcRenderer.invoke('docker:containerAction', id, action),
  },

  // Supervisor (native macOS service manager on port 9090)
  supervisor: {
    health: () => ipcRenderer.invoke('supervisor:health'),
    services: () => ipcRenderer.invoke('supervisor:services'),
    serviceAction: (id: string, action: 'start' | 'stop' | 'restart') =>
      ipcRenderer.invoke('supervisor:serviceAction', id, action),
    bulkAction: (action: 'start-all' | 'stop-all') =>
      ipcRenderer.invoke('supervisor:bulkAction', action),
    mode: (mode?: 'lite' | 'heavy') =>
      ipcRenderer.invoke('supervisor:mode', mode),
    ping: () => ipcRenderer.invoke('supervisor:ping'),
  },

  // 3-Surgeon protocol (cross-exam, consensus, gains-gate)
  surgeons: {
    probe: () => ipcRenderer.invoke('surgeons:probe'),
    crossExam: (topic: string) => ipcRenderer.invoke('surgeons:crossExam', topic),
    consensus: (claim: string) => ipcRenderer.invoke('surgeons:consensus', claim),
    gainsGate: () => ipcRenderer.invoke('surgeons:gainsGate'),
    status: () => ipcRenderer.invoke('surgeons:status'),
  },

  // Shell/Terminal (for integrated terminal)
  shell: {
    create: (opts?: { cwd?: string; shell?: string }) =>
      ipcRenderer.invoke('shell:create', opts),
    write: (id: string, data: string) =>
      ipcRenderer.invoke('shell:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('shell:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('shell:kill', id),
    onData: (id: string, callback: (data: string) => void) => {
      const handler = (_: unknown, termId: string, data: string) => {
        if (termId === id) callback(data);
      };
      ipcRenderer.on('shell:data', handler);
      return () => ipcRenderer.removeListener('shell:data', handler);
    },
    onExit: (id: string, callback: (code: number) => void) => {
      const handler = (_: unknown, termId: string, code: number) => {
        if (termId === id) callback(code);
      };
      ipcRenderer.on('shell:exit', handler);
      return () => ipcRenderer.removeListener('shell:exit', handler);
    },
  },
});
