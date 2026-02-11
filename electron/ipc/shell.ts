import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import os from 'os';

// node-pty is an optional native dependency
let pty: any = null;
try {
  pty = require('node-pty');
} catch {
  // node-pty not installed — terminal features disabled
}

const terminals = new Map<string, any>();
let terminalCounter = 0;

export function registerShellHandlers() {
  ipcMain.handle('shell:create', (event: IpcMainInvokeEvent, opts?: { cwd?: string; shell?: string }) => {
    if (!pty) return { error: 'node-pty not available', id: null };

    const id = `term_${++terminalCounter}`;
    const shellPath = opts?.shell ?? (process.platform === 'win32' ? 'powershell.exe' : os.userInfo().shell ?? '/bin/zsh');
    const cwd = opts?.cwd ?? os.homedir();

    try {
      const term = pty.spawn(shellPath, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      term.onData((data: string) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        win?.webContents.send('shell:data', id, data);
      });

      term.onExit(({ exitCode }: { exitCode: number }) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        win?.webContents.send('shell:exit', id, exitCode);
        terminals.delete(id);
      });

      terminals.set(id, term);
      return { id };
    } catch (err: any) {
      return { error: err.message, id: null };
    }
  });

  ipcMain.handle('shell:write', (_event: IpcMainInvokeEvent, id: string, data: string) => {
    const term = terminals.get(id);
    if (!term) return { error: 'Terminal not found' };
    term.write(data);
    return { success: true };
  });

  ipcMain.handle('shell:resize', (_event: IpcMainInvokeEvent, id: string, cols: number, rows: number) => {
    const term = terminals.get(id);
    if (!term) return { error: 'Terminal not found' };
    term.resize(cols, rows);
    return { success: true };
  });

  ipcMain.handle('shell:kill', (_event: IpcMainInvokeEvent, id: string) => {
    const term = terminals.get(id);
    if (!term) return { error: 'Terminal not found' };
    term.kill();
    terminals.delete(id);
    return { success: true };
  });
}
