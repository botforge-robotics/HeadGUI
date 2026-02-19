const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupSerialHandlers } = require('./serial.cjs');

const CONFIG_FILENAME = 'headgui-config.json';

function getConfigPath() {
  return path.join(app.getPath('userData'), CONFIG_FILENAME);
}

function readConfigFile() {
  const filePath = getConfigPath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function writeConfigFile(data) {
  const filePath = getConfigPath();
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write config:', err);
  }
}

// Disable sandbox on Linux for development (fixes SUID sandbox error)
if (process.platform === 'linux') {
    app.commandLine.appendSwitch('no-sandbox');
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        backgroundColor: '#0a0a0a',
    });

    // Load from Vite dev server or built files
    const startUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    Menu.setApplicationMenu(null);

    // F12 or Ctrl+Shift+I (Cmd+Option+I on Mac) toggles DevTools console
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i') || (input.meta && input.alt && input.key.toLowerCase() === 'i')) {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });
}

app.whenReady().then(() => {
    createWindow();
    setupSerialHandlers(ipcMain);

    ipcMain.handle('store:get', async (event, key) => {
      if (key !== 'config') return null;
      const data = readConfigFile();
      if (data == null) return { savedPositions: [], timelines: [] };
      return {
        savedPositions: Array.isArray(data.savedPositions) ? data.savedPositions : [],
        timelines: Array.isArray(data.timelines) ? data.timelines : [],
      };
    });

    ipcMain.handle('store:set', async (event, key, value) => {
      if (key !== 'config' || value == null) return;
      const payload = {
        savedPositions: Array.isArray(value.savedPositions) ? value.savedPositions : [],
        timelines: Array.isArray(value.timelines) ? value.timelines : [],
      };
      writeConfigFile(payload);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
