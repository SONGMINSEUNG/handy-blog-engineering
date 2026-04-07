import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startPythonServer() {
  const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
  const scriptPath = isDev
    ? path.join(__dirname, '../../backend/run.py')
    : path.join(process.resourcesPath, 'backend/run.py');

  console.log('Starting Python server...');
  console.log('Script path:', scriptPath);

  pythonProcess = spawn(pythonPath, [scriptPath], {
    cwd: isDev
      ? path.join(__dirname, '../../backend')
      : path.join(process.resourcesPath, 'backend'),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  pythonProcess.stdout?.on('data', (data) => {
    console.log(`[Python] ${data}`);
  });

  pythonProcess.stderr?.on('data', (data) => {
    console.error(`[Python Error] ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python server exited with code ${code}`);
  });
}

function stopPythonServer() {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
}

app.whenReady().then(() => {
  startPythonServer();

  // Python 서버가 시작될 시간을 주기 위해 약간 대기
  setTimeout(() => {
    createWindow();
  }, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopPythonServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPythonServer();
});

// IPC handlers
ipcMain.handle('get-python-status', () => {
  return pythonProcess !== null;
});
