import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { registerWindowHandlers } from './ipc/window';
import { registerFileSystemHandlers } from './ipc/file-system';
import { registerDockerHandlers } from './ipc/docker';
import { registerShellHandlers } from './ipc/shell';
import { registerSupervisorHandlers } from './ipc/supervisor';
import { loadEndpoints } from './config';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const endpoints = loadEndpoints();
const isDev = process.env.NODE_ENV !== 'production';

let mainWindow: BrowserWindow | null = null;

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false, // Custom titlebar (macOS traffic lights still show)
    titleBarStyle: 'hiddenInset', // macOS: show traffic lights, hide titlebar
    trafficLightPosition: { x: 12, y: 10 },
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Load the Next.js app
  if (isDev) {
    mainWindow.loadURL(endpoints.devServer);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load from exported static files
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// ---------------------------------------------------------------------------
// IPC Registration
// ---------------------------------------------------------------------------
function registerAllHandlers(win: BrowserWindow) {
  registerWindowHandlers(win);
  registerFileSystemHandlers();
  registerDockerHandlers();
  registerShellHandlers();
  registerSupervisorHandlers();
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  const win = createWindow();
  registerAllHandlers(win);

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow();
      registerAllHandlers(newWin);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
