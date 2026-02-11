'use client';

import { useCallback } from 'react';
import {
  ChevronRight,
  FileCode,
  Folder,
  Home,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BreadcrumbBarProps {
  /** Full file path (e.g., "src/components/App.tsx") */
  filePath: string | null;
  /** Callback when a path segment is clicked */
  onNavigate?: (path: string) => void;
  /** Optional symbol path (e.g., "function > handleClick") */
  symbolPath?: string[];
}

// ---------------------------------------------------------------------------
// File icon helper
// ---------------------------------------------------------------------------
function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'rb', 'swift', 'kt', 'c', 'cpp', 'h'];
  if (ext && codeExts.includes(ext)) {
    return <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
  }
  return <FileCode className="w-3.5 h-3.5 text-[#6b6b75] flex-shrink-0" />;
}

// ---------------------------------------------------------------------------
// BreadcrumbBar — main export
// ---------------------------------------------------------------------------
export function BreadcrumbBar({ filePath, onNavigate, symbolPath }: BreadcrumbBarProps) {
  const segments = filePath ? filePath.split('/').filter(Boolean) : [];

  const handleSegmentClick = useCallback(
    (index: number) => {
      if (!onNavigate || !filePath) return;
      const path = segments.slice(0, index + 1).join('/');
      onNavigate(path);
    },
    [onNavigate, filePath, segments],
  );

  if (!filePath) {
    return (
      <div className="flex items-center h-[22px] px-3 bg-[#0f0f17] border-b border-[#2a2a35]/50 text-[#6b6b75]">
        <Home className="w-3 h-3 mr-1.5" />
        <span className="text-[11px]">No file open</span>
      </div>
    );
  }

  const fileName = segments[segments.length - 1] ?? '';

  return (
    <div className="flex items-center h-[22px] px-2 bg-[#0f0f17] border-b border-[#2a2a35]/50 overflow-x-auto scrollbar-none">
      {/* Root / workspace icon */}
      <button
        onClick={() => onNavigate?.('')}
        className="flex items-center text-[#6b6b75] hover:text-[#e5e5e5] flex-shrink-0 transition-colors"
        title="Workspace root"
      >
        <Home className="w-3 h-3" />
      </button>

      {/* Path segments */}
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const isDir = !isLast;

        return (
          <div key={index} className="flex items-center flex-shrink-0">
            <ChevronRight className="w-3 h-3 text-[#2a2a35] mx-0.5" />
            <button
              onClick={() => handleSegmentClick(index)}
              className={`flex items-center gap-1 px-1 rounded text-[11px] transition-colors ${
                isLast
                  ? 'text-[#e5e5e5] font-medium'
                  : 'text-[#6b6b75] hover:text-[#e5e5e5]'
              }`}
            >
              {isDir ? (
                <Folder className="w-3 h-3 text-[#22c55e]/70 flex-shrink-0" />
              ) : (
                getFileIcon(fileName)
              )}
              <span className="truncate max-w-[120px]">{segment}</span>
            </button>
          </div>
        );
      })}

      {/* Symbol path (e.g., function > method) */}
      {symbolPath && symbolPath.length > 0 && (
        <>
          <div className="w-px h-3 bg-[#2a2a35] mx-2 flex-shrink-0" />
          {symbolPath.map((symbol, index) => (
            <div key={`sym-${index}`} className="flex items-center flex-shrink-0">
              {index > 0 && <ChevronRight className="w-3 h-3 text-[#2a2a35] mx-0.5" />}
              <span className="text-[11px] text-[#8a8a9a] px-1">{symbol}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
