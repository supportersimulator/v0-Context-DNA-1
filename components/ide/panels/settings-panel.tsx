'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Settings,
  Search,
  RotateCcw,
  Download,
  Upload,
  ChevronRight,
  Palette,
  Code2,
  FolderOpen,
  Brain,
  Bell,
  Server,
  Zap,
  Keyboard,
  X,
  Check,
} from 'lucide-react';
import {
  type IDESettings,
  type SettingMeta,
  type SettingCategory,
  SETTING_DEFAULTS,
  SETTING_METADATA,
  SETTING_CATEGORIES,
  useSettings,
  useSettingsVersion,
} from '@/lib/ide/settings-store';
import {
  getAvailableThemes,
  applyTheme,
  getThemeById,
  resolveThemeFromSettings,
} from '@/lib/ide/theme-engine';

// ---------------------------------------------------------------------------
// Category icons
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<SettingCategory, React.ReactNode> = {
  Appearance: <Palette className="w-4 h-4" />,
  Editor: <Code2 className="w-4 h-4" />,
  Explorer: <FolderOpen className="w-4 h-4" />,
  AI: <Brain className="w-4 h-4" />,
  Notifications: <Bell className="w-4 h-4" />,
  Backend: <Server className="w-4 h-4" />,
  Performance: <Zap className="w-4 h-4" />,
  Keyboard: <Keyboard className="w-4 h-4" />,
};

// ---------------------------------------------------------------------------
// Accent color presets
// ---------------------------------------------------------------------------

const ACCENT_PRESETS = [
  { color: '#22c55e', label: 'DNA Green' },
  { color: '#3b82f6', label: 'Blue' },
  { color: '#8b5cf6', label: 'Purple' },
  { color: '#f59e0b', label: 'Amber' },
  { color: '#ef4444', label: 'Red' },
  { color: '#ec4899', label: 'Pink' },
  { color: '#06b6d4', label: 'Cyan' },
  { color: '#f97316', label: 'Orange' },
];

// ---------------------------------------------------------------------------
// Toggle Switch
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-5 w-9 items-center rounded-full transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1
        ${checked ? 'bg-[var(--primary)]' : 'bg-[#2a2a35]'}
      `}
    >
      <span
        className={`
          inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform
          ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}
        `}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Number input with slider
// ---------------------------------------------------------------------------

function NumberInput({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-3 w-full max-w-xs">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 rounded-full appearance-none bg-[#2a2a35] accent-[var(--primary)] cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--primary)]
          [&::-webkit-slider-thumb]:cursor-pointer"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!isNaN(n) && n >= min && n <= max) onChange(n);
        }}
        className="w-16 px-2 py-1 text-xs text-[#e5e5e5] bg-[#111118] border border-[#2a2a35] rounded
          focus:outline-none focus:border-[var(--primary)] text-center"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text input
// ---------------------------------------------------------------------------

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full max-w-sm px-2.5 py-1.5 text-xs text-[#e5e5e5] bg-[#111118] border border-[#2a2a35] rounded
        focus:outline-none focus:border-[var(--primary)] placeholder:text-[#4a4a55]"
    />
  );
}

// ---------------------------------------------------------------------------
// Select dropdown
// ---------------------------------------------------------------------------

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1.5 text-xs text-[#e5e5e5] bg-[#111118] border border-[#2a2a35] rounded
        focus:outline-none focus:border-[var(--primary)] cursor-pointer
        [&>option]:bg-[#111118] [&>option]:text-[#e5e5e5]"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Color picker with preset swatches
// ---------------------------------------------------------------------------

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {ACCENT_PRESETS.map((p) => (
          <button
            key={p.color}
            title={p.label}
            onClick={() => onChange(p.color)}
            className={`
              w-6 h-6 rounded-full border-2 transition-all
              ${value === p.color ? 'border-white scale-110' : 'border-transparent hover:border-[#6b6b75]'}
            `}
            style={{ backgroundColor: p.color }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5 ml-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border-none bg-transparent
            [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none"
        />
        <span className="text-xs text-[#6b6b75] font-mono">{value}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// JSON editor (for keyboard.customBindings)
// ---------------------------------------------------------------------------

function JsonEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const [raw, setRaw] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleBlur = () => {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        onChange(parsed);
        setError(null);
      } else {
        setError('Must be a JSON object');
      }
    } catch {
      setError('Invalid JSON');
    }
  };

  return (
    <div className="w-full max-w-sm">
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={handleBlur}
        rows={4}
        spellCheck={false}
        className="w-full px-2.5 py-2 text-xs text-[#e5e5e5] bg-[#111118] border border-[#2a2a35] rounded
          font-mono focus:outline-none focus:border-[var(--primary)] resize-y placeholder:text-[#4a4a55]"
        placeholder='{ "commandId": "Ctrl+Shift+P" }'
      />
      {error && (
        <span className="text-xs text-red-400 mt-1 block">{error}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Theme selector — special control for appearance.theme
// Shows theme previews with built-in themes
// ---------------------------------------------------------------------------

function ThemeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const themes = getAvailableThemes();
  const themeOptions = ['dark', 'light', 'system'] as const;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {themeOptions.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`
              px-3 py-1.5 text-xs rounded border transition-all capitalize
              ${value === opt
                ? 'bg-[var(--primary)]/15 border-[var(--primary)] text-[var(--primary)]'
                : 'bg-[#111118] border-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5] hover:border-[#3a3a45]'}
            `}
          >
            {opt}
          </button>
        ))}
      </div>
      {/* Theme preview swatches */}
      <div className="flex gap-2 mt-2">
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              onChange(t.mode);
              applyTheme(t);
            }}
            title={t.name}
            className="flex flex-col gap-0 rounded overflow-hidden border border-[#2a2a35] hover:border-[var(--primary)] transition-colors"
          >
            <div className="flex h-4 w-20">
              <div className="flex-1" style={{ backgroundColor: t.colors.bgBase }} />
              <div className="flex-1" style={{ backgroundColor: t.colors.bgSurface }} />
              <div className="flex-1" style={{ backgroundColor: t.colors.bgElevated }} />
            </div>
            <div className="flex h-2 w-20">
              <div className="flex-1" style={{ backgroundColor: t.colors.accent }} />
              <div className="flex-1" style={{ backgroundColor: t.colors.info }} />
              <div className="flex-1" style={{ backgroundColor: t.colors.warning }} />
            </div>
            <span className="text-[9px] text-[#6b6b75] px-1 py-0.5 bg-[#111118] text-center">
              {t.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual setting row
// ---------------------------------------------------------------------------

function SettingRow({ meta }: { meta: SettingMeta }) {
  const store = useSettings();
  // Force re-render on any settings change
  useSettingsVersion();

  const value = store.get(meta.key);
  const isModified = store.isModified(meta.key);

  const handleChange = useCallback(
    (newValue: unknown) => {
      store.set(meta.key, newValue as any);
      // If this is a theme change, also apply the theme
      if (meta.key === 'appearance.theme') {
        const theme = resolveThemeFromSettings();
        applyTheme(theme);
      }
      if (meta.key === 'appearance.accentColor') {
        const theme = resolveThemeFromSettings();
        applyTheme(theme);
      }
    },
    [store, meta.key],
  );

  const handleReset = useCallback(() => {
    store.reset(meta.key);
    if (meta.key === 'appearance.theme' || meta.key === 'appearance.accentColor') {
      const theme = resolveThemeFromSettings();
      applyTheme(theme);
    }
  }, [store, meta.key]);

  // Render appropriate control
  let control: React.ReactNode;

  if (meta.key === 'appearance.theme') {
    control = (
      <ThemeSelector
        value={value as string}
        onChange={(v) => handleChange(v)}
      />
    );
  } else if (meta.type === 'boolean') {
    control = (
      <Toggle checked={value as boolean} onChange={(v) => handleChange(v)} />
    );
  } else if (meta.type === 'number') {
    control = (
      <NumberInput
        value={value as number}
        onChange={(v) => handleChange(v)}
        min={meta.min}
        max={meta.max}
        step={meta.step}
      />
    );
  } else if (meta.type === 'enum') {
    control = (
      <SelectInput
        value={value as string}
        onChange={(v) => handleChange(v)}
        options={meta.enumValues ?? []}
      />
    );
  } else if (meta.type === 'color') {
    control = (
      <ColorPicker
        value={value as string}
        onChange={(v) => handleChange(v)}
      />
    );
  } else if (meta.type === 'json') {
    control = (
      <JsonEditor
        value={value as Record<string, string>}
        onChange={(v) => handleChange(v)}
      />
    );
  } else {
    control = (
      <TextInput
        value={value as string}
        onChange={(v) => handleChange(v)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 hover:bg-[#111118]/50 transition-colors group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#e5e5e5]">{meta.label}</span>
            {isModified && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] flex-shrink-0" title="Modified" />
            )}
          </div>
          <p className="text-[11px] text-[#6b6b75] mt-0.5 leading-relaxed">
            {meta.description}
          </p>
        </div>
        {isModified && (
          <button
            onClick={handleReset}
            title="Reset to default"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[#2a2a35] flex-shrink-0 mt-0.5"
          >
            <RotateCcw className="w-3 h-3 text-[#6b6b75]" />
          </button>
        )}
      </div>
      <div className="mt-1">{control}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category section
// ---------------------------------------------------------------------------

function CategorySection({
  category,
  settings,
  isExpanded,
  onToggle,
}: {
  category: SettingCategory;
  settings: SettingMeta[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-[#2a2a35]/50">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-[#111118] transition-colors"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-[#6b6b75] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
        <span className="text-[var(--primary)]">{CATEGORY_ICONS[category]}</span>
        <span className="text-xs font-semibold text-[#e5e5e5] tracking-wide uppercase">
          {category}
        </span>
        <span className="text-[10px] text-[#4a4a55] ml-auto">{settings.length}</span>
      </button>
      {isExpanded && (
        <div className="border-t border-[#2a2a35]/30">
          {settings.map((meta) => (
            <SettingRow key={meta.key} meta={meta} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsPanel — main exported component
// ---------------------------------------------------------------------------

export function SettingsPanel() {
  const store = useSettings();
  useSettingsVersion(); // re-render on any change

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(SETTING_CATEGORIES),
  );
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter settings by search query
  const filteredByCategory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const map = new Map<SettingCategory, SettingMeta[]>();

    for (const cat of SETTING_CATEGORIES) {
      const settings = SETTING_METADATA.filter((m) => m.category === cat);
      if (!q) {
        map.set(cat, settings);
      } else {
        const filtered = settings.filter(
          (m) =>
            m.label.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q) ||
            m.key.toLowerCase().includes(q),
        );
        if (filtered.length > 0) map.set(cat, filtered);
      }
    }

    return map;
  }, [searchQuery]);

  // Expand/collapse category
  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // Export settings as JSON file
  const handleExport = useCallback(() => {
    const data = store.export();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contextdna-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [store]);

  // Import settings from JSON file
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string);
          if (typeof parsed === 'object' && parsed !== null) {
            store.import(parsed as Partial<IDESettings>);
            // Re-apply theme after import
            const theme = resolveThemeFromSettings();
            applyTheme(theme);
            setImportStatus('success');
            setTimeout(() => setImportStatus('idle'), 2000);
          } else {
            setImportStatus('error');
            setTimeout(() => setImportStatus('idle'), 2000);
          }
        } catch {
          setImportStatus('error');
          setTimeout(() => setImportStatus('idle'), 2000);
        }
      };
      reader.readAsText(file);
      // Reset input so same file can be re-imported
      e.target.value = '';
    },
    [store],
  );

  // Reset all settings
  const handleResetAll = useCallback(() => {
    store.resetAll();
    const theme = resolveThemeFromSettings();
    applyTheme(theme);
  }, [store]);

  // Count modified settings
  const modifiedCount = useMemo(() => {
    return SETTING_METADATA.filter((m) => store.isModified(m.key)).length;
  }, [store]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a35] flex-shrink-0">
        <Settings className="w-3.5 h-3.5 text-[var(--primary)]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Settings</span>
        {modifiedCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/15 text-[var(--primary)]">
            {modifiedCount} modified
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleExport}
            title="Export settings"
            className="p-1 rounded hover:bg-[#1a1a24] transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[#6b6b75] hover:text-[#e5e5e5]" />
          </button>
          <button
            onClick={handleImport}
            title="Import settings"
            className="p-1 rounded hover:bg-[#1a1a24] transition-colors"
          >
            {importStatus === 'success' ? (
              <Check className="w-3.5 h-3.5 text-[var(--primary)]" />
            ) : importStatus === 'error' ? (
              <X className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-[#6b6b75] hover:text-[#e5e5e5]" />
            )}
          </button>
          {modifiedCount > 0 && (
            <button
              onClick={handleResetAll}
              title="Reset all to defaults"
              className="p-1 rounded hover:bg-[#1a1a24] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#6b6b75] hover:text-red-400" />
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-[#2a2a35]/50 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a4a55]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings..."
            className="w-full pl-8 pr-8 py-1.5 text-xs text-[#e5e5e5] bg-[#111118] border border-[#2a2a35] rounded
              focus:outline-none focus:border-[var(--primary)] placeholder:text-[#4a4a55]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="w-3.5 h-3.5 text-[#4a4a55] hover:text-[#e5e5e5]" />
            </button>
          )}
        </div>
        {searchQuery && (
          <span className="text-[10px] text-[#4a4a55] mt-1 block">
            {Array.from(filteredByCategory.values()).reduce((acc, arr) => acc + arr.length, 0)} results
          </span>
        )}
      </div>

      {/* Settings list */}
      <div className="flex-1 overflow-auto">
        {filteredByCategory.size === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-[#4a4a55] text-xs gap-1">
            <Search className="w-5 h-5 opacity-50" />
            <span>No settings match &quot;{searchQuery}&quot;</span>
          </div>
        ) : (
          Array.from(filteredByCategory.entries()).map(([category, settings]) => (
            <CategorySection
              key={category}
              category={category}
              settings={settings}
              isExpanded={expandedCategories.has(category) || searchQuery.length > 0}
              onToggle={() => toggleCategory(category)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#2a2a35] text-[10px] text-[#4a4a55] flex-shrink-0">
        <span>
          {SETTING_METADATA.length} settings
          {modifiedCount > 0 && ` / ${modifiedCount} customized`}
        </span>
        <span className="font-mono">localStorage</span>
      </div>
    </div>
  );
}
