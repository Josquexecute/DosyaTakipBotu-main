import path from 'node:path';
import { app, BrowserWindow, Menu, screen, session } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { IpcController } from './ipc';
import { LocalCacheStore } from './local-cache/local-cache-store';
import { DebugLogger } from './debug-logger';
import { hardenWindow, installContentSecurityPolicy, SECURITY_FLAGS } from './security';
import { ThumbnailCache } from './local-cache/thumbnail-cache';
import { APP_VERSION } from '../shared/constants';
import { IPC_SEND_CHANNEL } from '../shared/ipc-contract';

let mainWindow: BrowserWindow | null = null;
let cache: LocalCacheStore;
let logger: DebugLogger;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  cache = new LocalCacheStore(app.getPath('appData'));
  await cache.ensure();
  logger = new DebugLogger(cache.logsDir);
  await logger.log('INFO', 'HasarBotu başlatılıyor');
  await new ThumbnailCache(cache.thumbnailsDir).cleanup();
  installContentSecurityPolicy(session.defaultSession);
  new IpcController(cache, () => mainWindow, logger).register();
  installTurkishMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}).catch((error) => {
  console.error(error);
  app.quit();
});

function createMainWindow(): void {
  const bounds = getResponsiveWindowBounds();
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    title: `HasarBotu / Baran Ekspertiz v${APP_VERSION}`,
    backgroundColor: '#f9f9ff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: SECURITY_FLAGS.contextIsolation,
      nodeIntegration: SECURITY_FLAGS.nodeIntegration,
      sandbox: SECURITY_FLAGS.sandbox,
      webSecurity: SECURITY_FLAGS.webSecurity,
      devTools: !app.isPackaged
    }
  });
  hardenWindow(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist-ui', 'renderer', 'index.html'));
}


function getResponsiveWindowBounds(): { width: number; height: number; minWidth: number; minHeight: number } {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workAreaSize;
  // Çalışma alanından kenar payı düşülür. Tüm değerler ekranı asla aşamaz;
  // böylece düşük çözünürlüklü ekranlarda da pencere sığar ve küçültülebilir.
  const availableWidth = Math.max(320, workArea.width - 32);
  const availableHeight = Math.max(320, workArea.height - 32);
  // Tercih edilen minimumlar; ancak ekran daha küçükse çalışma alanına indirilir.
  const minWidth = Math.min(1040, availableWidth);
  const minHeight = Math.min(680, availableHeight);
  return {
    width: Math.min(1440, availableWidth),
    height: Math.min(920, availableHeight),
    minWidth,
    minHeight
  };
}

function installTurkishMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Dosya',
      submenu: [
        { label: 'Yeniden Tara', accelerator: 'F5', click: () => sendRendererCommand('menu:scan') },
        { label: 'Ayarlar', accelerator: 'Ctrl+,', click: () => sendRendererCommand('menu:settings') },
        { type: 'separator' },
        { label: 'Çıkış', accelerator: 'Alt+F4', click: () => app.quit() }
      ]
    },
    {
      label: 'Düzen',
      submenu: [
        { label: 'Geri Al', accelerator: 'Ctrl+Z', role: 'undo' },
        { label: 'Yinele', accelerator: 'Ctrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Kes', accelerator: 'Ctrl+X', role: 'cut' },
        { label: 'Kopyala', accelerator: 'Ctrl+C', role: 'copy' },
        { label: 'Yapıştır', accelerator: 'Ctrl+V', role: 'paste' },
        { label: 'Tümünü Seç', accelerator: 'Ctrl+A', role: 'selectAll' }
      ]
    },
    {
      label: 'Görünüm',
      submenu: [
        { label: 'Yakınlaştır', accelerator: 'Ctrl+=', click: () => sendRendererCommand('menu:zoom-in') },
        { label: 'Uzaklaştır', accelerator: 'Ctrl+-', click: () => sendRendererCommand('menu:zoom-out') },
        { label: 'Yakınlaştırmayı Sıfırla', accelerator: 'Ctrl+0', click: () => sendRendererCommand('menu:zoom-reset') },
        { type: 'separator' },
        { label: 'Temayı Değiştir', accelerator: 'Ctrl+T', click: () => sendRendererCommand('menu:toggle-theme') },
        ...(app.isPackaged ? [] : [{ type: 'separator' as const }, { label: 'Geliştirici Araçları', accelerator: 'F12', role: 'toggleDevTools' as const }])
      ]
    },
    {
      label: 'Pencere',
      submenu: [
        { label: 'Simge Durumuna Küçült', role: 'minimize' },
        { label: 'Kapat', role: 'close' }
      ]
    },
    {
      label: 'Yardım',
      submenu: [
        { label: `Sürüm v${APP_VERSION}`, enabled: false },
        { label: 'Sürüm / Kurulum Kontrolü', click: () => sendRendererCommand('menu:settings') },
        { label: 'Tanılama Raporu', click: () => sendRendererCommand('menu:health') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendRendererCommand(command: string): void {
  mainWindow?.webContents.send(IPC_SEND_CHANNEL.menuCommand, command);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
