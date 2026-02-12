'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Monitor,
  Smartphone,
  Tablet,
  RotateCw,
  RefreshCw,
  Maximize2,
  ChevronDown,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DevicePreset {
  id: string;
  name: string;
  platform: 'ios' | 'android' | 'web';
  width: number;
  height: number;
  scale: number;
  hasNotch: boolean;
  category: 'phone' | 'tablet' | 'desktop';
}

// ---------------------------------------------------------------------------
// Device presets
// ---------------------------------------------------------------------------
const DEVICES: DevicePreset[] = [
  { id: 'iphone15pro',    name: 'iPhone 15 Pro',      platform: 'ios',     width: 393,  height: 852,  scale: 3,   hasNotch: true,  category: 'phone'   },
  { id: 'iphonese',       name: 'iPhone SE',           platform: 'ios',     width: 375,  height: 667,  scale: 2,   hasNotch: false, category: 'phone'   },
  { id: 'iphone15promax', name: 'iPhone 15 Pro Max',   platform: 'ios',     width: 430,  height: 932,  scale: 3,   hasNotch: true,  category: 'phone'   },
  { id: 'ipadpro',        name: 'iPad Pro 12.9"',      platform: 'ios',     width: 1024, height: 1366, scale: 2,   hasNotch: false, category: 'tablet'  },
  { id: 'ipadair',        name: 'iPad Air',            platform: 'ios',     width: 820,  height: 1180, scale: 2,   hasNotch: false, category: 'tablet'  },
  { id: 'pixel8',         name: 'Pixel 8',             platform: 'android', width: 412,  height: 915,  scale: 2.6, hasNotch: true,  category: 'phone'   },
  { id: 'galaxys24',      name: 'Samsung Galaxy S24',  platform: 'android', width: 360,  height: 780,  scale: 3,   hasNotch: true,  category: 'phone'   },
  { id: 'desktophd',      name: 'Desktop HD',          platform: 'web',     width: 1920, height: 1080, scale: 1,   hasNotch: false, category: 'desktop' },
  { id: 'desktop',        name: 'Desktop',             platform: 'web',     width: 1440, height: 900,  scale: 2,   hasNotch: false, category: 'desktop' },
  { id: 'tabletgeneric',  name: 'Tablet Generic',      platform: 'web',     width: 768,  height: 1024, scale: 2,   hasNotch: false, category: 'tablet'  },
];

type PlatformFilter = 'all' | 'ios' | 'android' | 'web';
type Orientation = 'portrait' | 'landscape';
type ZoomLevel = 'fit' | '50' | '75' | '100';

const ZOOM_VALUES: Record<ZoomLevel, number | null> = {
  fit: null,
  '50': 0.5,
  '75': 0.75,
  '100': 1,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function platformIcon(cat: DevicePreset['category']) {
  switch (cat) {
    case 'phone':   return <Smartphone className="w-3 h-3" />;
    case 'tablet':  return <Tablet className="w-3 h-3" />;
    case 'desktop': return <Monitor className="w-3 h-3" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function FrontendPreviewPanel() {
  const [selectedDeviceId, setSelectedDeviceId] = useState('iphone15pro');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [previewUrl, setPreviewUrl] = useState('http://localhost:3000');
  const [zoom, setZoom] = useState<ZoomLevel>('fit');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const device = useMemo(
    () => DEVICES.find((d) => d.id === selectedDeviceId) ?? DEVICES[0],
    [selectedDeviceId],
  );

  const filteredDevices = useMemo(
    () => (platformFilter === 'all' ? DEVICES : DEVICES.filter((d) => d.platform === platformFilter)),
    [platformFilter],
  );

  const deviceW = orientation === 'portrait' ? device.width : device.height;
  const deviceH = orientation === 'portrait' ? device.height : device.width;

  // Compute scale factor to fit device inside the preview area
  const computedScale = useMemo(() => {
    if (zoom !== 'fit') return ZOOM_VALUES[zoom]!;
    // Rough available area — panel minus controls (~120px top) and status bar (~32px bottom)
    const availW = 800;
    const availH = 600;
    const bezelPad = 40; // bezel adds ~20px each side
    const scaleX = availW / (deviceW + bezelPad);
    const scaleY = availH / (deviceH + bezelPad);
    return Math.min(scaleX, scaleY, 1);
  }, [zoom, deviceW, deviceH]);

  const toggleOrientation = useCallback(() => {
    setOrientation((o) => (o === 'portrait' ? 'landscape' : 'portrait'));
  }, []);

  const reloadIframe = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = previewUrl;
    }
  }, [previewUrl]);

  const orientationLabel = orientation === 'portrait' ? 'Portrait' : 'Landscape';

  // Bezel styling
  const isPhone = device.category === 'phone';
  const isTablet = device.category === 'tablet';
  const bezelRadius = isPhone ? 40 : isTablet ? 24 : 8;
  const bezelPadding = isPhone ? 16 : isTablet ? 12 : 4;

  const platformTabs: { key: PlatformFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'ios', label: 'iOS' },
    { key: 'android', label: 'Android' },
    { key: 'web', label: 'Web' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] text-[#e0e0e8] text-xs select-none">
      {/* ── Controls bar ─────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#2a2a35] bg-[#111118]">
        {/* URL input */}
        <input
          type="text"
          value={previewUrl}
          onChange={(e) => setPreviewUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && reloadIframe()}
          className="flex-1 min-w-0 px-2 py-1 rounded bg-[#1a1a24] border border-[#2a2a35] text-[#e0e0e8] text-xs outline-none focus:border-[#4a4a5a] placeholder-[#555]"
          placeholder="http://localhost:3000"
        />

        {/* Reload */}
        <button
          onClick={reloadIframe}
          className="p-1 rounded hover:bg-[#1a1a24] text-[#888] hover:text-[#e0e0e8] transition-colors"
          title="Reload"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* Device selector */}
        <div className="relative">
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="appearance-none pl-2 pr-6 py-1 rounded bg-[#1a1a24] border border-[#2a2a35] text-[#e0e0e8] text-xs outline-none focus:border-[#4a4a5a] cursor-pointer"
          >
            {filteredDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#666]" />
        </div>

        {/* Rotate */}
        <button
          onClick={toggleOrientation}
          className="p-1 rounded hover:bg-[#1a1a24] text-[#888] hover:text-[#e0e0e8] transition-colors"
          title={`Rotate to ${orientation === 'portrait' ? 'landscape' : 'portrait'}`}
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        {/* Zoom */}
        <div className="relative">
          <select
            value={zoom}
            onChange={(e) => setZoom(e.target.value as ZoomLevel)}
            className="appearance-none pl-2 pr-6 py-1 rounded bg-[#1a1a24] border border-[#2a2a35] text-[#e0e0e8] text-xs outline-none focus:border-[#4a4a5a] cursor-pointer"
          >
            <option value="fit">Fit</option>
            <option value="50">50%</option>
            <option value="75">75%</option>
            <option value="100">100%</option>
          </select>
          <Maximize2 className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#666]" />
        </div>
      </div>

      {/* ── Platform filter tabs ─────────────────────────────── */}
      <div className="flex items-center gap-0 px-2 py-1 border-b border-[#2a2a35] bg-[#0e0e16]">
        {platformTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setPlatformFilter(tab.key)}
            className={`px-3 py-0.5 rounded-sm text-xs transition-colors ${
              platformFilter === tab.key
                ? 'bg-[#1a1a24] text-[#e0e0e8] border border-[#3a3a45]'
                : 'text-[#666] hover:text-[#aaa]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Preview area ─────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-auto p-4"
      >
        <div
          style={{
            transform: `scale(${computedScale})`,
            transformOrigin: 'center center',
          }}
        >
          {/* Device bezel */}
          <div
            className="relative bg-[#1c1c26] border-2 border-[#2a2a35] shadow-lg shadow-black/40"
            style={{
              borderRadius: bezelRadius,
              padding: bezelPadding,
              width: deviceW + bezelPadding * 2 + 4,
              height: deviceH + bezelPadding * 2 + 4,
            }}
          >
            {/* Notch */}
            {device.hasNotch && orientation === 'portrait' && (
              <div
                className="absolute bg-[#0a0a0f] rounded-b-lg z-10"
                style={{
                  width: 120,
                  height: 28,
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  borderBottomLeftRadius: 16,
                  borderBottomRightRadius: 16,
                }}
              />
            )}
            {device.hasNotch && orientation === 'landscape' && (
              <div
                className="absolute bg-[#0a0a0f] z-10"
                style={{
                  width: 28,
                  height: 120,
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  borderTopRightRadius: 16,
                  borderBottomRightRadius: 16,
                }}
              />
            )}

            {/* Iframe */}
            <iframe
              ref={iframeRef}
              src={previewUrl}
              sandbox="allow-scripts allow-same-origin allow-forms"
              className="bg-white"
              style={{
                width: deviceW,
                height: deviceH,
                border: 'none',
                borderRadius: Math.max(bezelRadius - bezelPadding, 0),
              }}
              title="Frontend Preview"
            />
          </div>
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#2a2a35] bg-[#111118] text-[#666]">
        <div className="flex items-center gap-2">
          {platformIcon(device.category)}
          <span>{device.name}</span>
          <span className="text-[#444]">|</span>
          <span className="font-mono">{deviceW} x {deviceH}</span>
          <span className="text-[#444]">|</span>
          <span>{orientationLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#444]">@{device.scale}x</span>
          <span className="text-[#444]">|</span>
          <span>{Math.round(computedScale * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
