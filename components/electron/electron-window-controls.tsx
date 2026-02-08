'use client';

import React, { useState } from 'react';
import { Minus, Square, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useResponsive } from '@/lib/contexts/responsive-context';

interface ElectronWindowControlsProps {
  className?: string;
  showMobileToggle?: boolean;
}

export function ElectronWindowControls({
  className,
  showMobileToggle = true,
}: ElectronWindowControlsProps) {
  const { state, setElectronMobileMode } = useResponsive();
  const [isMaximized, setIsMaximized] = useState(false);

  if (!state.isElectron) {
    return null; // Don't show in web browser
  }

  const handleMinimize = () => {
    if ((window as any).electron?.minimize) {
      (window as any).electron.minimize();
    }
  };

  const handleMaximize = () => {
    setIsMaximized(!isMaximized);
    if ((window as any).electron?.maximize) {
      (window as any).electron.maximize();
    }
  };

  const handleClose = () => {
    if ((window as any).electron?.close) {
      (window as any).electron.close();
    }
  };

  const handleMobileToggle = () => {
    setElectronMobileMode(!state.isElectronMobileMode);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1 bg-background/50 backdrop-blur border-b border-border/50',
        className
      )}
    >
      {/* Mobile Toggle Button */}
      {showMobileToggle && (
        <Button
          variant='ghost'
          size='sm'
          onClick={handleMobileToggle}
          className={cn(
            'h-7 px-2 gap-1 text-xs',
            state.isElectronMobileMode
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title={state.isElectronMobileMode ? 'Exit Mobile Mode' : 'Enter Mobile Mode'}
        >
          <Smartphone className='w-3 h-3' />
          <span className='hidden sm:inline'>
            {state.isElectronMobileMode ? 'Mobile' : 'Desktop'}
          </span>
        </Button>
      )}

      {/* Spacer */}
      <div className='flex-1' />

      {/* Standard Window Controls */}
      <div className='flex items-center gap-2'>
        {/* Minimize */}
        <Button
          variant='ghost'
          size='sm'
          onClick={handleMinimize}
          className='h-7 w-7 p-0 hover:bg-muted'
          title='Minimize'
        >
          <Minus className='w-3 h-3' />
        </Button>

        {/* Maximize/Restore */}
        <Button
          variant='ghost'
          size='sm'
          onClick={handleMaximize}
          className='h-7 w-7 p-0 hover:bg-muted'
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          <Square className='w-3 h-3' />
        </Button>

        {/* Close */}
        <Button
          variant='ghost'
          size='sm'
          onClick={handleClose}
          className='h-7 w-7 p-0 hover:bg-destructive/20 hover:text-destructive'
          title='Close'
        >
          <X className='w-3 h-3' />
        </Button>
      </div>
    </div>
  );
}

/**
 * Info: This component renders the Electron window controls.
 * In production, place this at the very top of your Electron main window.
 *
 * The actual Electron main process needs these handlers:
 *
 * ```typescript
 * // main.ts (Electron main process)
 * const mainWindow = createWindow();
 *
 * ipcMain.handle('window:minimize', () => mainWindow.minimize());
 * ipcMain.handle('window:maximize', () => mainWindow.maximize());
 * ipcMain.handle('window:close', () => mainWindow.close());
 * ipcMain.handle('window:resizeToMobile', () => {
 *   mainWindow.setSize(390, 844);
 * });
 * ipcMain.handle('window:resizeToDesktop', () => {
 *   mainWindow.setSize(1400, 900);
 * });
 * ```
 *
 * And in your preload script:
 * ```typescript
 * // preload.ts
 * window.electron = {
 *   minimize: () => ipcRenderer.invoke('window:minimize'),
 *   maximize: () => ipcRenderer.invoke('window:maximize'),
 *   close: () => ipcRenderer.invoke('window:close'),
 *   resizeToMobile: () => ipcRenderer.invoke('window:resizeToMobile'),
 *   resizeToDesktop: () => ipcRenderer.invoke('window:resizeToDesktop'),
 * };
 * ```
 */
