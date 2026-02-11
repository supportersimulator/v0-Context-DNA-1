'use client';

import {
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
} from 'react';
import { getEventBus } from '@/lib/ide/event-bus';

// =============================================================================
// Types
// =============================================================================

export interface KeyBinding {
  /** Unique command ID: 'view.toggleExplorer' */
  id: string;
  /** Key combo: 'cmd+b', 'cmd+shift+p', 'cmd+k cmd+c' (chord) */
  key: string;
  /** Human-readable: 'Toggle Explorer' */
  command: string;
  /** Grouping: 'View', 'Navigation', 'Workspace', 'System' */
  category: string;
  /** Context condition: '!inputFocus && panelFocus' */
  when?: string;
  /** Action to execute */
  handler: () => void;
  /** Platform-specific binding */
  platform?: 'mac' | 'win' | 'linux' | 'all';
}

/** A binding definition without a handler (for default/user storage). */
export type KeyBindingDef = Omit<KeyBinding, 'handler'>;

export interface KeyBindingContext {
  /** User is typing in input/textarea/contentEditable */
  inputFocus: boolean;
  /** Currently focused panel ID */
  panelFocus: string | null;
  /** Command palette is open */
  commandPaletteVisible: boolean;
  /** Explorer sidebar is visible */
  explorerVisible: boolean;
  /** Focus/distraction-free mode is active */
  focusMode: boolean;
  /** Running in Electron shell */
  isElectron: boolean;
  /** Extensible: any component can add context values */
  [key: string]: unknown;
}

export interface ChordState {
  /** Whether chord mode is active (waiting for second key) */
  active: boolean;
  /** The first key combo that activated chord mode */
  firstKey: string | null;
}

// =============================================================================
// Platform detection — SSR-safe
// =============================================================================

function detectPlatform(): 'mac' | 'win' | 'linux' {
  if (typeof navigator === 'undefined') return 'mac'; // SSR default
  const ua = navigator.userAgent || navigator.platform || '';
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return 'mac';
  if (/Win/i.test(ua)) return 'win';
  return 'linux';
}

const PLATFORM = detectPlatform();
const IS_MAC = PLATFORM === 'mac';

// =============================================================================
// Key normalization — translate user-facing key strings to KeyboardEvent keys
// =============================================================================

/**
 * Normalize a user-facing key combo string into a canonical internal form.
 * Canonical form uses sorted modifiers + lowercase key:
 *   'cmd+shift+p' → 'meta+shift+p' (mac) or 'control+shift+p' (win/linux)
 */
export function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/cmd|meta/g, IS_MAC ? 'meta' : 'control')
    .replace(/ctrl/g, 'control')
    .replace(/opt|option/g, 'alt');
}

/**
 * Parse a single key combo string into canonical {modifiers, key} representation.
 * Input: 'cmd+shift+p'
 * Output: { modifiers: ['meta', 'shift'], key: 'p' }
 */
function parseKeyCombo(raw: string): { modifiers: Set<string>; key: string } {
  const normalized = normalizeKey(raw);
  const parts = normalized.split('+').map((p) => p.trim()).filter(Boolean);
  const modifiers = new Set<string>();
  let key = '';

  for (const part of parts) {
    if (part === 'meta' || part === 'control' || part === 'alt' || part === 'shift') {
      modifiers.add(part);
    } else {
      key = part;
    }
  }

  return { modifiers, key };
}

/**
 * Convert a KeyboardEvent to a canonical combo string for matching.
 * Returns e.g. 'control+shift+p' or 'meta+b'
 */
function eventToCombo(e: KeyboardEvent): string {
  const modifiers: string[] = [];
  if (e.metaKey) modifiers.push('meta');
  if (e.ctrlKey) modifiers.push('control');
  if (e.altKey) modifiers.push('alt');
  if (e.shiftKey) modifiers.push('shift');

  // Normalize key name
  let key = e.key.toLowerCase();

  // Map special keys
  const KEY_MAP: Record<string, string> = {
    ' ': 'space',
    'arrowup': 'up',
    'arrowdown': 'down',
    'arrowleft': 'left',
    'arrowright': 'right',
    'backspace': 'backspace',
    'delete': 'delete',
    'enter': 'enter',
    'tab': 'tab',
    'escape': 'escape',
    'home': 'home',
    'end': 'end',
    'pageup': 'pageup',
    'pagedown': 'pagedown',
  };

  if (KEY_MAP[key]) {
    key = KEY_MAP[key];
  }

  // Don't include the modifier key itself as the "key"
  if (key === 'meta' || key === 'control' || key === 'alt' || key === 'shift') {
    return ''; // modifier-only press, not a real shortcut
  }

  modifiers.sort(); // canonical ordering
  return [...modifiers, key].join('+');
}

// =============================================================================
// Display formatting — platform-aware shortcut rendering
// =============================================================================

const MAC_SYMBOLS: Record<string, string> = {
  meta: '\u2318',     // ⌘
  control: '\u2303',  // ⌃
  alt: '\u2325',      // ⌥
  shift: '\u21E7',    // ⇧
  enter: '\u21A9',    // ↩
  escape: '\u238B',   // ⎋
  backspace: '\u232B', // ⌫
  delete: '\u2326',   // ⌦
  tab: '\u21E5',      // ⇥
  up: '\u2191',       // ↑
  down: '\u2193',     // ↓
  left: '\u2190',     // ←
  right: '\u2192',    // →
  space: '\u2423',    // ␣
};

const WIN_LABELS: Record<string, string> = {
  meta: 'Win',
  control: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  escape: 'Esc',
  backspace: 'Backspace',
  delete: 'Del',
  tab: 'Tab',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  space: 'Space',
};

/**
 * Format a key combo for display to the user.
 * Returns '⌘B' on Mac, 'Ctrl+B' on Windows/Linux.
 * For chords: '⌘K ⌘C' on Mac, 'Ctrl+K Ctrl+C' on Windows.
 */
export function formatKeyForDisplay(key: string): string {
  const chordParts = key.split(/\s+/);

  return chordParts
    .map((part) => {
      const normalized = normalizeKey(part);
      const segments = normalized.split('+');

      return segments
        .map((seg) => {
          if (IS_MAC) {
            return MAC_SYMBOLS[seg] ?? seg.toUpperCase();
          }
          return WIN_LABELS[seg] ?? seg.toUpperCase();
        })
        .join(IS_MAC ? '' : '+');
    })
    .join(IS_MAC ? ' ' : ' ');
}

// =============================================================================
// When-Clause Parser — evaluate VS Code-style context conditions
// =============================================================================

/**
 * Tokenizer for when-clause expressions.
 *
 * Grammar:
 *   expr     -> or_expr
 *   or_expr  -> and_expr ('||' and_expr)*
 *   and_expr -> cmp_expr ('&&' cmp_expr)*
 *   cmp_expr -> unary (('==' | '!=') value)?
 *   unary    -> '!'* primary
 *   primary  -> IDENT | STRING | BOOL | '(' expr ')'
 */

type Token =
  | { type: 'ident'; value: string }
  | { type: 'string'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'op'; value: '==' | '!=' | '&&' | '||' | '!' }
  | { type: 'paren'; value: '(' | ')' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (input[i] === ' ' || input[i] === '\t') {
      i++;
      continue;
    }

    // Parentheses
    if (input[i] === '(' || input[i] === ')') {
      tokens.push({ type: 'paren', value: input[i] as '(' | ')' });
      i++;
      continue;
    }

    // Two-char operators
    if (i + 1 < input.length) {
      const twoChar = input[i] + input[i + 1];
      if (twoChar === '==' || twoChar === '!=' || twoChar === '&&' || twoChar === '||') {
        tokens.push({ type: 'op', value: twoChar as '==' | '!=' | '&&' | '||' });
        i += 2;
        continue;
      }
    }

    // Single-char operator: !
    if (input[i] === '!') {
      tokens.push({ type: 'op', value: '!' });
      i++;
      continue;
    }

    // String literal
    if (input[i] === "'" || input[i] === '"') {
      const quote = input[i];
      i++;
      let str = '';
      while (i < input.length && input[i] !== quote) {
        str += input[i];
        i++;
      }
      i++; // consume closing quote
      tokens.push({ type: 'string', value: str });
      continue;
    }

    // Identifier or boolean keyword
    if (/[a-zA-Z_]/.test(input[i])) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_.]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      if (ident === 'true') {
        tokens.push({ type: 'bool', value: true });
      } else if (ident === 'false') {
        tokens.push({ type: 'bool', value: false });
      } else {
        tokens.push({ type: 'ident', value: ident });
      }
      continue;
    }

    // Skip unknown chars
    i++;
  }

  return tokens;
}

type WhenExpr =
  | { type: 'ident'; name: string }
  | { type: 'literal'; value: unknown }
  | { type: 'not'; operand: WhenExpr }
  | { type: 'compare'; op: '==' | '!='; left: WhenExpr; right: WhenExpr }
  | { type: 'and'; left: WhenExpr; right: WhenExpr }
  | { type: 'or'; left: WhenExpr; right: WhenExpr };

class WhenClauseParser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): WhenExpr {
    const expr = this.parseOr();
    return expr;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private parseOr(): WhenExpr {
    let left = this.parseAnd();

    while (this.peek()?.type === 'op' && this.peek()?.value === '||') {
      this.advance(); // consume '||'
      const right = this.parseAnd();
      left = { type: 'or', left, right };
    }

    return left;
  }

  private parseAnd(): WhenExpr {
    let left = this.parseCompare();

    while (this.peek()?.type === 'op' && this.peek()?.value === '&&') {
      this.advance(); // consume '&&'
      const right = this.parseCompare();
      left = { type: 'and', left, right };
    }

    return left;
  }

  private parseCompare(): WhenExpr {
    const left = this.parseUnary();

    const next = this.peek();
    if (next?.type === 'op' && (next.value === '==' || next.value === '!=')) {
      const op = this.advance().value as '==' | '!=';
      const right = this.parseUnary();
      return { type: 'compare', op, left, right };
    }

    return left;
  }

  private parseUnary(): WhenExpr {
    if (this.peek()?.type === 'op' && this.peek()?.value === '!') {
      this.advance(); // consume '!'
      const operand = this.parseUnary(); // allow !!x
      return { type: 'not', operand };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): WhenExpr {
    const token = this.peek();

    if (!token) {
      // Unexpected end — return a falsy literal
      return { type: 'literal', value: false };
    }

    if (token.type === 'paren' && token.value === '(') {
      this.advance(); // consume '('
      const expr = this.parseOr();
      // consume ')' if present
      if (this.peek()?.type === 'paren' && this.peek()?.value === ')') {
        this.advance();
      }
      return expr;
    }

    if (token.type === 'ident') {
      this.advance();
      return { type: 'ident', name: token.value };
    }

    if (token.type === 'string') {
      this.advance();
      return { type: 'literal', value: token.value };
    }

    if (token.type === 'bool') {
      this.advance();
      return { type: 'literal', value: token.value };
    }

    // fallback — skip and return false
    this.advance();
    return { type: 'literal', value: false };
  }
}

/** Parse and cache when-clause ASTs for performance. */
const whenClauseCache = new Map<string, WhenExpr>();

function parseWhenClause(clause: string): WhenExpr {
  const cached = whenClauseCache.get(clause);
  if (cached) return cached;

  const tokens = tokenize(clause);
  const parser = new WhenClauseParser(tokens);
  const ast = parser.parse();
  whenClauseCache.set(clause, ast);
  return ast;
}

function evaluateWhenExpr(expr: WhenExpr, ctx: KeyBindingContext): unknown {
  switch (expr.type) {
    case 'ident':
      return ctx[expr.name];
    case 'literal':
      return expr.value;
    case 'not':
      return !evaluateWhenExpr(expr.operand, ctx);
    case 'compare': {
      const l = evaluateWhenExpr(expr.left, ctx);
      const r = evaluateWhenExpr(expr.right, ctx);
      // eslint-disable-next-line eqeqeq
      return expr.op === '==' ? l == r : l != r;
    }
    case 'and':
      return evaluateWhenExpr(expr.left, ctx) && evaluateWhenExpr(expr.right, ctx);
    case 'or':
      return evaluateWhenExpr(expr.left, ctx) || evaluateWhenExpr(expr.right, ctx);
  }
}

/**
 * Evaluate a when-clause string against the current context.
 * Returns true if the clause is satisfied (or if no clause is specified).
 */
export function evaluateWhenClause(
  clause: string | undefined,
  ctx: KeyBindingContext,
): boolean {
  if (!clause || clause.trim() === '') return true;
  try {
    const ast = parseWhenClause(clause);
    return !!evaluateWhenExpr(ast, ctx);
  } catch {
    // Malformed clause — fail open (allow binding)
    return true;
  }
}

/**
 * Count the "specificity" of a when clause (number of conditions).
 * More specific clauses win in conflict resolution.
 */
function whenClauseSpecificity(clause: string | undefined): number {
  if (!clause) return 0;
  // Count identifiers + operators as a rough specificity score
  const tokens = tokenize(clause);
  return tokens.filter((t) => t.type === 'ident' || t.type === 'string' || t.type === 'bool').length;
}

// =============================================================================
// Default bindings — IDE standard shortcuts
// =============================================================================

export const DEFAULT_BINDINGS: KeyBindingDef[] = [
  // -- View -------------------------------------------------------------------
  {
    id: 'view.toggleExplorer',
    key: 'cmd+b',
    command: 'Toggle Explorer',
    category: 'View',
    when: '!inputFocus',
  },
  {
    id: 'view.toggleTerminal',
    key: 'cmd+`',
    command: 'Toggle Terminal',
    category: 'View',
  },
  {
    id: 'view.commandPalette',
    key: 'cmd+shift+p',
    command: 'Command Palette',
    category: 'View',
  },
  {
    id: 'view.focusNextPanel',
    key: 'f6',
    command: 'Focus Next Panel',
    category: 'View',
  },
  {
    id: 'view.escape',
    key: 'escape',
    command: 'Exit Focus Mode',
    category: 'View',
    when: 'focusMode && !commandPaletteVisible',
  },
  {
    id: 'view.escapeOverlay',
    key: 'escape',
    command: 'Close Overlay',
    category: 'View',
    when: 'commandPaletteVisible',
  },

  // -- Navigation -------------------------------------------------------------
  {
    id: 'nav.liveView',
    key: 'cmd+1',
    command: 'Live View',
    category: 'Navigation',
    when: '!inputFocus',
  },
  {
    id: 'nav.synaptic',
    key: 'cmd+2',
    command: 'Synaptic',
    category: 'Navigation',
    when: '!inputFocus',
  },
  {
    id: 'nav.dashboard',
    key: 'cmd+3',
    command: 'Dashboard',
    category: 'Navigation',
    when: '!inputFocus',
  },
  {
    id: 'nav.professor',
    key: 'cmd+4',
    command: 'Professor',
    category: 'Navigation',
    when: '!inputFocus',
  },

  // -- Workspace --------------------------------------------------------------
  {
    id: 'workspace.save',
    key: 'cmd+s',
    command: 'Save Layout',
    category: 'Workspace',
    when: '!inputFocus',
  },

  // -- Legacy -----------------------------------------------------------------
  {
    id: 'view.toggleFocusMode',
    key: 'cmd+i',
    command: 'Toggle Focus Mode',
    category: 'View',
    when: '!inputFocus',
  },
];

// =============================================================================
// User customization — localStorage persistence
// =============================================================================

const USER_BINDINGS_KEY = 'contextdna_keybindings';

export interface UserKeyOverride {
  id: string;
  key: string;
}

function loadUserOverrides(): UserKeyOverride[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USER_BINDINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* corrupted — ignore */
  }
  return [];
}

function saveUserOverrides(overrides: UserKeyOverride[]): void {
  try {
    localStorage.setItem(USER_BINDINGS_KEY, JSON.stringify(overrides));
  } catch {
    /* storage full — silent */
  }
}

export function getUserBindings(): UserKeyOverride[] {
  return loadUserOverrides();
}

export function setUserBinding(id: string, newKey: string): void {
  const overrides = loadUserOverrides();
  const existing = overrides.findIndex((o) => o.id === id);
  if (existing >= 0) {
    overrides[existing].key = newKey;
  } else {
    overrides.push({ id, key: newKey });
  }
  saveUserOverrides(overrides);
  // Notify the registry to rebuild
  KeyBindingRegistry.instance?.rebuild();
}

export function removeUserBinding(id: string): void {
  const overrides = loadUserOverrides().filter((o) => o.id !== id);
  saveUserOverrides(overrides);
  KeyBindingRegistry.instance?.rebuild();
}

export function resetAllUserBindings(): void {
  try {
    localStorage.removeItem(USER_BINDINGS_KEY);
  } catch {
    /* silent */
  }
  KeyBindingRegistry.instance?.rebuild();
}

// =============================================================================
// Chord state machine
// =============================================================================

const CHORD_TIMEOUT_MS = 2000;

interface ChordMachine {
  active: boolean;
  firstKey: string | null;
  firstCombo: string | null;
  timer: ReturnType<typeof setTimeout> | null;
}

// =============================================================================
// KeyBindingRegistry — singleton, one global keydown listener
// =============================================================================

type RegistryListener = () => void;

interface ResolvedBinding {
  binding: KeyBinding;
  /** Is this a chord? (has two parts) */
  isChord: boolean;
  /** Parsed first key combo (for chord matching) */
  firstCombo: { modifiers: Set<string>; key: string } | null;
  /** Parsed second key combo (for chord matching), or the only combo for non-chords */
  secondCombo: { modifiers: Set<string>; key: string };
  /** When clause specificity for priority resolution */
  specificity: number;
  /** The raw normalized first key string (for chord lookup) */
  firstRaw: string | null;
  /** The raw normalized full key string */
  fullNormalized: string;
}

export class KeyBindingRegistry {
  static instance: KeyBindingRegistry | null = null;

  private context: KeyBindingContext = {
    inputFocus: false,
    panelFocus: null,
    commandPaletteVisible: false,
    explorerVisible: false,
    focusMode: false,
    isElectron: typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).electronAPI,
  };

  private handlers = new Map<string, () => void>();
  private resolvedBindings: ResolvedBinding[] = [];
  private chord: ChordMachine = { active: false, firstKey: null, firstCombo: null, timer: null };
  private listeners = new Set<RegistryListener>();
  private chordListeners = new Set<RegistryListener>();
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private boundFocusIn: ((e: FocusEvent) => void) | null = null;
  private boundFocusOut: ((e: FocusEvent) => void) | null = null;
  private started = false;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  constructor() {
    if (typeof window !== 'undefined') {
      this.rebuild();
    }
  }

  /**
   * Attach global event listeners. Call once from a root-level useEffect.
   * Returns a teardown function.
   */
  start(): () => void {
    if (this.started || typeof window === 'undefined') return () => {};

    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundFocusIn = this.handleFocusIn.bind(this);
    this.boundFocusOut = this.handleFocusOut.bind(this);

    // Use capture phase to intercept before any component-level handlers
    window.addEventListener('keydown', this.boundKeyDown, true);
    document.addEventListener('focusin', this.boundFocusIn, true);
    document.addEventListener('focusout', this.boundFocusOut, true);

    this.started = true;

    return () => {
      this.stop();
    };
  }

  stop(): void {
    if (!this.started || typeof window === 'undefined') return;

    if (this.boundKeyDown) {
      window.removeEventListener('keydown', this.boundKeyDown, true);
    }
    if (this.boundFocusIn) {
      document.removeEventListener('focusin', this.boundFocusIn, true);
    }
    if (this.boundFocusOut) {
      document.removeEventListener('focusout', this.boundFocusOut, true);
    }

    this.cancelChord();
    this.started = false;
  }

  // -------------------------------------------------------------------------
  // Context management
  // -------------------------------------------------------------------------

  setContext<K extends keyof KeyBindingContext>(key: K, value: KeyBindingContext[K]): void;
  setContext(key: string, value: unknown): void;
  setContext(key: string, value: unknown): void {
    if ((this.context as Record<string, unknown>)[key] === value) return;
    (this.context as Record<string, unknown>)[key] = value;

    // Emit context change via event bus
    try {
      getEventBus().emit('settings:changed', {
        key: `context.${key}`,
        value,
        previous: (this.context as Record<string, unknown>)[key],
      });
    } catch {
      // Event bus may not be ready during SSR
    }
  }

  getContext(key: string): unknown {
    return (this.context as Record<string, unknown>)[key];
  }

  getFullContext(): Readonly<KeyBindingContext> {
    return this.context;
  }

  // -------------------------------------------------------------------------
  // Handler registration
  // -------------------------------------------------------------------------

  registerHandler(id: string, handler: () => void): () => void {
    this.handlers.set(id, handler);
    this.rebuild();

    return () => {
      // Only remove if this exact handler is still registered
      if (this.handlers.get(id) === handler) {
        this.handlers.delete(id);
        this.rebuild();
      }
    };
  }

  // -------------------------------------------------------------------------
  // Build resolved binding list (merge defaults + user overrides + handlers)
  // -------------------------------------------------------------------------

  rebuild(): void {
    const userOverrides = loadUserOverrides();
    const userMap = new Map(userOverrides.map((o) => [o.id, o.key]));

    const resolved: ResolvedBinding[] = [];

    for (const def of DEFAULT_BINDINGS) {
      const handler = this.handlers.get(def.id);
      if (!handler) continue; // No handler registered for this binding — skip

      // Platform filter
      if (def.platform && def.platform !== 'all' && def.platform !== PLATFORM) continue;

      // Apply user override for key
      const effectiveKey = userMap.get(def.id) ?? def.key;

      const binding: KeyBinding = {
        ...def,
        key: effectiveKey,
        handler,
      };

      // Parse the key — check for chord (space-separated parts)
      const chordParts = effectiveKey.trim().split(/\s+/);
      const isChord = chordParts.length >= 2;

      let firstCombo: { modifiers: Set<string>; key: string } | null = null;
      let secondCombo: { modifiers: Set<string>; key: string };
      let firstRaw: string | null = null;

      if (isChord) {
        firstCombo = parseKeyCombo(chordParts[0]);
        firstRaw = normalizeKey(chordParts[0]).split('+').sort().join('+');
        secondCombo = parseKeyCombo(chordParts[1]);
      } else {
        secondCombo = parseKeyCombo(chordParts[0]);
      }

      const fullNormalized = chordParts.map((p) => {
        const parsed = parseKeyCombo(p);
        const mods = Array.from(parsed.modifiers).sort();
        return [...mods, parsed.key].join('+');
      }).join(' ');

      resolved.push({
        binding,
        isChord,
        firstCombo,
        secondCombo,
        specificity: whenClauseSpecificity(def.when),
        firstRaw,
        fullNormalized,
      });
    }

    // Sort by specificity descending (most specific when-clause first)
    resolved.sort((a, b) => b.specificity - a.specificity);

    this.resolvedBindings = resolved;
    this.notifyListeners();
  }

  // -------------------------------------------------------------------------
  // Get all bindings for display
  // -------------------------------------------------------------------------

  getAllBindings(): KeyBinding[] {
    const userOverrides = loadUserOverrides();
    const userMap = new Map(userOverrides.map((o) => [o.id, o.key]));

    return DEFAULT_BINDINGS.map((def) => ({
      ...def,
      key: userMap.get(def.id) ?? def.key,
      handler: this.handlers.get(def.id) ?? (() => {}),
    }));
  }

  // -------------------------------------------------------------------------
  // Chord state
  // -------------------------------------------------------------------------

  getChordState(): ChordState {
    return {
      active: this.chord.active,
      firstKey: this.chord.firstKey,
    };
  }

  private enterChord(firstKey: string, firstCombo: string): void {
    this.cancelChord();
    this.chord.active = true;
    this.chord.firstKey = firstKey;
    this.chord.firstCombo = firstCombo;

    try {
      getEventBus().emit('shortcut:executed', {
        commandId: '__chord_start',
        shortcut: firstKey,
      });
    } catch {
      // Event bus not ready
    }

    this.chord.timer = setTimeout(() => {
      this.cancelChord();
    }, CHORD_TIMEOUT_MS);

    this.notifyChordListeners();
  }

  private cancelChord(): void {
    if (this.chord.timer) {
      clearTimeout(this.chord.timer);
      this.chord.timer = null;
    }
    if (this.chord.active) {
      this.chord.active = false;
      this.chord.firstKey = null;
      this.chord.firstCombo = null;
      this.notifyChordListeners();
    }
  }

  // -------------------------------------------------------------------------
  // Core keydown handler
  // -------------------------------------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    const combo = eventToCombo(e);
    if (!combo) return; // modifier-only press

    // ---- CHORD MODE: waiting for second key ----
    if (this.chord.active && this.chord.firstCombo) {
      // Look for bindings whose chord first part matches, and second part matches current combo
      const firstComboStr = this.chord.firstCombo;
      const match = this.findChordMatch(firstComboStr, combo);

      if (match) {
        e.preventDefault();
        e.stopPropagation();
        this.cancelChord();
        this.executeBinding(match);
        return;
      }

      // No chord match — cancel chord mode and fall through to normal handling
      this.cancelChord();
      // Don't return — let the key be processed as a normal shortcut below
    }

    // ---- NORMAL MODE: check for single-key bindings and chord starters ----

    // First check if this combo starts a chord
    const chordStarters = this.resolvedBindings.filter(
      (rb) => rb.isChord && rb.firstRaw === combo.split('+').sort().join('+'),
    );

    // Check for non-chord matches
    const directMatch = this.findDirectMatch(combo);

    if (directMatch) {
      e.preventDefault();
      e.stopPropagation();
      this.executeBinding(directMatch);
      return;
    }

    // If there are chord starters (but no direct match), enter chord mode
    if (chordStarters.length > 0) {
      // Verify at least one chord starter's when-clause is satisfied
      const validStarter = chordStarters.find((rb) =>
        evaluateWhenClause(rb.binding.when, this.context),
      );
      if (validStarter) {
        e.preventDefault();
        e.stopPropagation();
        this.enterChord(validStarter.binding.key.split(/\s+/)[0], combo);
        return;
      }
    }
  }

  /**
   * Find the best direct (non-chord) match for a key combo.
   * Returns the most specific binding whose when-clause is satisfied.
   */
  private findDirectMatch(combo: string): ResolvedBinding | null {
    const comboSorted = combo.split('+').sort().join('+');

    for (const rb of this.resolvedBindings) {
      if (rb.isChord) continue;

      // Build canonical combo string from parsed parts
      const bindingCombo = [
        ...Array.from(rb.secondCombo.modifiers).sort(),
        rb.secondCombo.key,
      ].join('+');

      if (bindingCombo === comboSorted && evaluateWhenClause(rb.binding.when, this.context)) {
        return rb;
      }
    }

    return null;
  }

  /**
   * Find the best chord match: first key already matched, now check second key.
   */
  private findChordMatch(firstComboStr: string, secondCombo: string): ResolvedBinding | null {
    const firstSorted = firstComboStr.split('+').sort().join('+');
    const secondSorted = secondCombo.split('+').sort().join('+');

    for (const rb of this.resolvedBindings) {
      if (!rb.isChord || !rb.firstRaw) continue;

      if (rb.firstRaw === firstSorted) {
        const bindingSecond = [
          ...Array.from(rb.secondCombo.modifiers).sort(),
          rb.secondCombo.key,
        ].join('+');

        if (bindingSecond === secondSorted && evaluateWhenClause(rb.binding.when, this.context)) {
          return rb;
        }
      }
    }

    return null;
  }

  private executeBinding(rb: ResolvedBinding): void {
    try {
      rb.binding.handler();
    } catch (err) {
      console.error(`[keybinding-registry] Handler error for "${rb.binding.id}":`, err);
    }

    // Emit event
    try {
      getEventBus().emit('shortcut:executed', {
        commandId: rb.binding.id,
        shortcut: rb.binding.key,
      });
    } catch {
      // Event bus not ready
    }
  }

  // -------------------------------------------------------------------------
  // Focus tracking — auto-detect inputFocus
  // -------------------------------------------------------------------------

  private handleFocusIn(e: FocusEvent): void {
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      this.setContext('inputFocus', true);
    }
  }

  private handleFocusOut(e: FocusEvent): void {
    const related = e.relatedTarget;
    if (
      related instanceof HTMLInputElement ||
      related instanceof HTMLTextAreaElement ||
      (related instanceof HTMLElement && related.isContentEditable)
    ) {
      // Focus moved to another input — stay in inputFocus
      return;
    }
    this.setContext('inputFocus', false);
  }

  // -------------------------------------------------------------------------
  // Subscription for useSyncExternalStore
  // -------------------------------------------------------------------------

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeChord(listener: RegistryListener): () => void {
    this.chordListeners.add(listener);
    return () => this.chordListeners.delete(listener);
  }

  private notifyListeners(): void {
    const snapshot = Array.from(this.listeners);
    for (let i = 0; i < snapshot.length; i++) {
      snapshot[i]();
    }
  }

  private notifyChordListeners(): void {
    const snapshot = Array.from(this.chordListeners);
    for (let i = 0; i < snapshot.length; i++) {
      snapshot[i]();
    }
  }

  // -------------------------------------------------------------------------
  // Snapshot for useSyncExternalStore
  // -------------------------------------------------------------------------

  getBindingsSnapshot(): KeyBinding[] {
    return this.resolvedBindings.map((rb) => rb.binding);
  }
}

// =============================================================================
// Singleton access — SSR-safe
// =============================================================================

let _registry: KeyBindingRegistry | null = null;

export function getKeybindingRegistry(): KeyBindingRegistry {
  if (!_registry) {
    _registry = new KeyBindingRegistry();
    KeyBindingRegistry.instance = _registry;
  }
  return _registry;
}

/**
 * Reset the singleton (for testing only).
 */
export function _resetKeybindingRegistry(): void {
  if (_registry) {
    _registry.stop();
    _registry = null;
    KeyBindingRegistry.instance = null;
  }
}

// =============================================================================
// React Hooks
// =============================================================================

/**
 * Initialize the keybinding system. Call ONCE in your root layout/shell.
 * Attaches the single global keydown listener.
 *
 * Usage:
 *   function RootLayout() {
 *     useKeybindingInit();
 *     return <>{children}</>;
 *   }
 */
export function useKeybindingInit(): void {
  useEffect(() => {
    const registry = getKeybindingRegistry();
    const teardown = registry.start();
    return teardown;
  }, []);
}

/**
 * Register a keybinding handler for a command ID.
 * The handler is automatically cleaned up on unmount.
 *
 * Usage:
 *   useKeybinding('view.toggleExplorer', () => {
 *     setExplorerVisible((v) => !v);
 *   });
 */
export function useKeybinding(id: string, handler: () => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const registry = getKeybindingRegistry();
    const unregister = registry.registerHandler(id, () => {
      handlerRef.current();
    });
    return unregister;
  }, [id]);
}

/**
 * Register multiple keybinding handlers at once.
 * More efficient than multiple useKeybinding calls for the same component.
 *
 * Usage:
 *   useKeybindings({
 *     'nav.liveView': () => navigate('live'),
 *     'nav.synaptic': () => navigate('synaptic'),
 *     'nav.dashboard': () => navigate('dashboard'),
 *   });
 */
export function useKeybindings(bindings: Record<string, () => void>): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  // Stable key list for dependency tracking
  const keys = Object.keys(bindings).sort().join(',');

  useEffect(() => {
    const registry = getKeybindingRegistry();
    const unregisters: (() => void)[] = [];

    for (const [id, handler] of Object.entries(bindingsRef.current)) {
      const stableHandler = () => {
        bindingsRef.current[id]?.();
      };
      unregisters.push(registry.registerHandler(id, stableHandler));
    }

    return () => {
      for (const unregister of unregisters) {
        unregister();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
}

/**
 * Get all keybindings (for Settings panel display).
 * Returns a reactive list that updates when bindings change.
 */
export function useAllKeybindings(): KeyBinding[] {
  const registry = getKeybindingRegistry();

  return useSyncExternalStore(
    useCallback((cb: () => void) => registry.subscribe(cb), [registry]),
    () => registry.getAllBindings(),
    () => [], // SSR fallback
  );
}

/**
 * Set a context value from a component. Automatically cleans up on unmount.
 *
 * Usage:
 *   useKeyContext('panelFocus', 'terminal');
 *   useKeyContext('focusMode', isFocused);
 */
export function useKeyContext(key: string, value: unknown): void {
  const registry = getKeybindingRegistry();

  useEffect(() => {
    registry.setContext(key, value);
    // No cleanup needed — context persists until next set
  }, [registry, key, value]);
}

/**
 * Check if chord mode is active (for UI status indicator).
 *
 * Usage:
 *   const { active, firstKey } = useChordMode();
 *   if (active) showStatusBar(`${firstKey} pressed, waiting...`);
 */
export function useChordMode(): ChordState {
  const registry = getKeybindingRegistry();

  return useSyncExternalStore(
    useCallback((cb: () => void) => registry.subscribeChord(cb), [registry]),
    () => registry.getChordState(),
    () => ({ active: false, firstKey: null }), // SSR fallback
  );
}

/**
 * Imperatively set context from outside React.
 *
 * Usage:
 *   import { setContext } from '@/lib/ide/keybinding-registry';
 *   setContext('panelFocus', 'terminal');
 */
export function setContext(key: string, value: unknown): void {
  getKeybindingRegistry().setContext(key, value);
}

/**
 * Imperatively get context from outside React.
 */
export function getContext(key: string): unknown {
  return getKeybindingRegistry().getContext(key);
}
