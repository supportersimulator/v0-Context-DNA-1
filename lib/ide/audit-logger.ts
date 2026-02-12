// =============================================================================
// audit-logger.ts — Persistent Action Audit Trail
//
// Every MCP action (and optionally any CapabilityBus action) is logged here.
// Stored in localStorage with configurable rotation. Supports filtering,
// export, and clear.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: string;
  timestamp: number;
  action: string;
  provider: string;
  sourcePanel: string;
  outcome: 'success' | 'error' | 'denied' | 'cancelled';
  reason?: string;
  error?: string;
  params?: Record<string, unknown>;
  durationMs?: number;
}

export interface AuditFilter {
  provider?: string;
  outcome?: AuditEntry['outcome'];
  sourcePanel?: string;
  since?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// AuditLogger
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'contextdna_audit_log';
const MAX_ENTRIES = 1000;

class AuditLogger {
  private entries: AuditEntry[] = [];

  constructor() {
    this.loadFromStorage();
  }

  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const full: AuditEntry = {
      ...entry,
      id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    this.entries.push(full);

    // Rotate: keep only the last MAX_ENTRIES
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }

    this.persistToStorage();
  }

  getEntries(filter?: AuditFilter): AuditEntry[] {
    let result = this.entries;
    if (filter?.provider) result = result.filter((e) => e.provider === filter.provider);
    if (filter?.outcome) result = result.filter((e) => e.outcome === filter.outcome);
    if (filter?.sourcePanel) result = result.filter((e) => e.sourcePanel === filter.sourcePanel);
    if (filter?.since) result = result.filter((e) => e.timestamp >= filter.since!);
    if (filter?.limit) result = result.slice(-filter.limit);
    return result;
  }

  getRecentEntries(count = 50): AuditEntry[] {
    return this.entries.slice(-count);
  }

  clear(): void {
    this.entries = [];
    this.persistToStorage();
  }

  export(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  get count(): number {
    return this.entries.length;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed;
      }
    } catch {
      console.warn('[AuditLogger] Failed to parse stored audit log, starting fresh');
    }
  }

  private persistToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      console.warn('[AuditLogger] Failed to persist audit log');
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _logger: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!_logger) {
    _logger = new AuditLogger();
  }
  return _logger;
}
