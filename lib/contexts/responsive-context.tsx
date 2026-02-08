'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type DeviceMode = 'desktop' | 'tablet' | 'mobile' | 'electron-mobile';

export interface ResponsiveState {
  deviceMode: DeviceMode;
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isElectron: boolean;
  isElectronMobileMode: boolean;
  breakpoint: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

interface ResponsiveContextType {
  state: ResponsiveState;
  setElectronMobileMode: (enabled: boolean) => void;
  forceDeviceMode: (mode: DeviceMode) => void;
}

const ResponsiveContext = createContext<ResponsiveContextType | undefined>(undefined);

// Breakpoints matching Tailwind
const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

const MOBILE_WIDTH = 390; // iPhone width
const MOBILE_HEIGHT = 844; // iPhone height
const TABLET_WIDTH = 768;
const TABLET_HEIGHT = 1024;

export function ResponsiveProvider({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  const [height, setHeight] = useState<number>(
    typeof window !== 'undefined' ? window.innerHeight : 768
  );
  const [forcedMode, setForcedMode] = useState<DeviceMode | null>(null);
  const [electronMobileMode, setElectronMobileMode] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  // Detect if running in Electron
  useEffect(() => {
    const isElectronEnv =
      typeof window !== 'undefined' &&
      (window as any).electron !== undefined;
    setIsElectron(isElectronEnv);
  }, []);

  // Listen for window resize
  useEffect(() => {
    const handleResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Determine device mode
  const getDeviceMode = (): DeviceMode => {
    if (forcedMode) return forcedMode;

    if (electronMobileMode && isElectron) {
      return 'electron-mobile';
    }

    if (width < BREAKPOINTS.md) return 'mobile';
    if (width < BREAKPOINTS.lg) return 'tablet';
    return 'desktop';
  };

  const deviceMode = getDeviceMode();

  // Determine breakpoint
  const getBreakpoint = (): 'sm' | 'md' | 'lg' | 'xl' | '2xl' => {
    if (deviceMode === 'electron-mobile') return 'sm';
    if (width < BREAKPOINTS.md) return 'sm';
    if (width < BREAKPOINTS.lg) return 'md';
    if (width < BREAKPOINTS.xl) return 'lg';
    if (width < BREAKPOINTS['2xl']) return 'xl';
    return '2xl';
  };

  const state: ResponsiveState = {
    deviceMode,
    width,
    height,
    isMobile: deviceMode === 'mobile',
    isTablet: deviceMode === 'tablet',
    isDesktop: deviceMode === 'desktop',
    isElectron,
    isElectronMobileMode: electronMobileMode,
    breakpoint: getBreakpoint(),
  };

  const value: ResponsiveContextType = {
    state,
    setElectronMobileMode: (enabled) => {
      setElectronMobileMode(enabled);
      if (enabled && isElectron) {
        // Request Electron to resize window to mobile size
        if ((window as any).electron?.resizeToMobile) {
          (window as any).electron.resizeToMobile();
        }
      } else if (!enabled && isElectron) {
        // Request Electron to restore window to desktop size
        if ((window as any).electron?.resizeToDesktop) {
          (window as any).electron.resizeToDesktop();
        }
      }
    },
    forceDeviceMode: setForcedMode,
  };

  return (
    <ResponsiveContext.Provider value={value}>
      {children}
    </ResponsiveContext.Provider>
  );
}

export function useResponsive() {
  const context = useContext(ResponsiveContext);
  if (!context) {
    throw new Error('useResponsive must be used within ResponsiveProvider');
  }
  return context;
}
