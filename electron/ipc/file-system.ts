import { ipcMain, IpcMainInvokeEvent, IpcMainEvent } from 'electron';
import fs from 'fs';
import path from 'path';

// Watcher registry for cleanup
const watchers = new Map<string, fs.FSWatcher>();

export function registerFileSystemHandlers() {
  ipcMain.handle('fs:readDir', async (_event: IpcMainInvokeEvent, dirPath: string) => {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }));
  });

  ipcMain.handle('fs:readFile', async (_event: IpcMainInvokeEvent, filePath: string) => {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const stat = await fs.promises.stat(filePath);
    return {
      content,
      size: stat.size,
      modified: stat.mtimeMs,
    };
  });

  ipcMain.on('fs:watchDir', (event: IpcMainEvent, dirPath: string) => {
    // Cleanup existing watcher for this path
    if (watchers.has(dirPath)) {
      watchers.get(dirPath)!.close();
    }

    const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (filename) {
        event.sender.send('fs:watchEvent', eventType, path.join(dirPath, filename));
      }
    });

    watchers.set(dirPath, watcher);
  });

  ipcMain.on('fs:unwatchDir', (_event: IpcMainEvent, dirPath: string) => {
    const watcher = watchers.get(dirPath);
    if (watcher) {
      watcher.close();
      watchers.delete(dirPath);
    }
  });
}
