import { BrowserWindow, ipcMain } from 'electron';

export function registerWindowHandlers(win: BrowserWindow) {
  ipcMain.handle('window:minimize', () => win.minimize());

  ipcMain.handle('window:maximize', () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle('window:close', () => win.close());

  ipcMain.handle('window:isMaximized', () => win.isMaximized());

  ipcMain.handle('window:resizeToMobile', () => {
    win.unmaximize();
    win.setSize(390, 844);
    win.center();
  });

  ipcMain.handle('window:resizeToDesktop', () => {
    win.setSize(1400, 900);
    win.center();
  });
}
