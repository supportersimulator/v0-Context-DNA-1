// =============================================================================
// PermissionGovernor — TypeScript types (Z2 scaffold, 2026-05-07)
//
// Wire shape for the read-side permission map produced by
// `multifleet.permission_governor.PermissionGovernor`. The IDE consumes this
// via GET /api/permissions/current, which shells out to
// `scripts/dump-permission-snapshot.py`.
//
// SCAFFOLD ONLY: Z2 declares the contract. Z3+ wires write-side gating into
// `GovernedPacket` emission paths. Do NOT widen this surface speculatively —
// extensions belong in Z3 alongside the gating logic.
//
// Disjoint event namespace: `permission:*` — does NOT collide with
// `surgeon:*`, `evidence:*`, `race:*`, `fleet:*`, or `gold:*`. PermissionMap
// is a sibling, not a subordinate, of those streams. When Z3+ wires this in,
// the fleet→IDE bridge already routes by namespace prefix (see
// `lib/ide/event-bridge.ts`), so adding `permission:*` requires only the
// type declarations below + a registry entry in IDEEvents.
// =============================================================================

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

/**
 * Tri-state permission result mirroring `PermissionStatus` in the Python
 * scaffold:
 *
 * - `granted`  : actor may use the capability — gates open.
 * - `denied`   : actor must NOT use the capability — gate at the call site
 *                in Z3+; in Z2 this value is read-only / advisory.
 * - `degraded` : actor may use the capability with reduced privilege
 *                (low-data regime, mixed evidence). The exact interpretation
 *                is up to the gating consumer (Z3+).
 */
export type PermissionStatus = 'granted' | 'denied' | 'degraded';

/**
 * Single (capability, actor) decision. Mirrors the Python dataclass
 * `multifleet.permission_governor.PermissionEntry`.
 */
export type PermissionEntry = {
  /** Capability name, e.g. `packet.emit`, `race.start`, `claude-code-sdk.tool`. */
  capability: string;
  /** Actor id — fleet node, surgeon, agent. e.g. `atlas`, `cardio`, `mac1`. */
  actor: string;
  /** Tri-state decision. */
  status: PermissionStatus;
  /** ISO-8601 UTC timestamp the decision was computed. */
  last_evaluated_at: string;
  /** Human-readable explanation, e.g. `pass_ratio=0.875 >= grant_threshold=0.80`. */
  reason: string;
  /** EvidenceLedger record_ids that influenced this decision. Sorted, deduped. */
  evidence_record_ids: string[];
};

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/**
 * The full permission decision set for one evaluate() call. Mirrors
 * `PermissionMap` in Python. Snapshots are content-addressed via `hash`.
 */
export type PermissionMap = {
  /** Schema version — bumped when the wire shape changes. */
  schema_version: string | number;
  /** ISO-8601 UTC timestamp the map was computed. `null` when no snapshot. */
  generated_at: string | null;
  /** All (capability, actor) entries — sorted by (capability, actor) on serialise. */
  entries: PermissionEntry[];
  /**
   * SHA-256 hex over canonical JSON of the map content (excluding
   * `generated_at` and `hash`). Lets consumers verify integrity + dedupe
   * snapshots without parsing every entry.
   */
  hash?: string;
  /**
   * Producer hint. The route surfaces:
   *   - `'snapshot'`     — a real snapshot was found and returned.
   *   - `'no-snapshot'`  — DB exists but is empty.
   *   - `'error'`        — Python helper failed; entries are an empty list.
   *   - `'import-error'` — multifleet package not importable.
   */
  source?: 'snapshot' | 'no-snapshot' | 'error' | 'import-error';
  /** Optional error message when `source === 'error' | 'import-error'`. */
  error?: string;
};

// ---------------------------------------------------------------------------
// Defaults — used by both the route and the panel for safe rendering
// ---------------------------------------------------------------------------

/** Empty permission map — used by the route on "no snapshot exists". */
export const EMPTY_PERMISSION_MAP: PermissionMap = {
  schema_version: 0,
  generated_at: null,
  entries: [],
  source: 'no-snapshot',
};

// ---------------------------------------------------------------------------
// Event-bus registry payloads (permission:* namespace)
//
// Declared here so the namespace contract lives in one place. Z3+ folds these
// into `IDEEvents` (lib/ide/event-bus.ts) when write-side gating is wired.
// ---------------------------------------------------------------------------

/** Fired whenever the governor writes a new snapshot. */
export type PermissionSnapshotEvent = {
  /** SHA-256 hash of the new snapshot. */
  snapshot_id: string;
  generated_at: string;
  /** Convenience: count of entries by status. */
  status_counts?: Partial<Record<PermissionStatus, number>>;
  timestamp?: string;
};

/** Fired when a single (capability, actor) decision flips status. */
export type PermissionFlipEvent = {
  capability: string;
  actor: string;
  previous: PermissionStatus;
  current: PermissionStatus;
  reason?: string;
  timestamp?: string;
};

/**
 * Disjoint registry of all `permission:*` events. Z3+ will spread this into
 * `IDEEvents`. Use `keyof PermissionEvent` in tests to assert no collisions
 * with surgeon:* / evidence:* / race:* / fleet:* namespaces.
 */
export interface PermissionEvent {
  'permission:snapshot': PermissionSnapshotEvent;
  'permission:flip': PermissionFlipEvent;
}

/**
 * Generic envelope for any `permission.*` event coming off the fleet bridge.
 * Z3+ subscribes to this shape and dispatches by the inner `type` discriminator.
 * Mirrors the `fleet:event` / `surgeon:event` pattern so the bridge needs no
 * special-case for the new namespace.
 */
export type PermissionGenericEvent = {
  /** Original Python event type, e.g. `permission.snapshot` / `permission.flip`. */
  type: string;
  payload: Record<string, unknown>;
  source?: string;
  timestamp?: string | number;
  correlation_id?: string;
  session_id?: string;
};

// ---------------------------------------------------------------------------
// PermissionDenialEntry (Z3 — write-side gating)
// ---------------------------------------------------------------------------
//
// One row in the "recent denials" tail surfaced by `PermissionsPillRow` when
// the EvidenceLedger has at least one record whose content carries
// `event_type: 'permission_denial_recorded'`. The shape mirrors the Python
// content-dict written by `multifleet.chief_audit._record_permission_denial`.
//
// The IDE consumes this via the existing T1 ledger snapshot bridge
// (`scripts/dump-evidence-ledger-summary.py` -> `LedgerSummary.records`),
// filtering by `event_type` on the parsed `summary` field. Z4+ may add a
// dedicated `event_type` column to `LedgerSummaryEntry` so the IDE doesn't
// need to parse the summary string — kept minimal here for blast-radius.
// ---------------------------------------------------------------------------

export type PermissionDenialEntry = {
  /** Content-addressed record_id of the denial entry in the EvidenceLedger. */
  record_id: string;
  /** ISO-8601 UTC timestamp the denial was recorded. */
  created_at: string;
  /** The capability that was denied (e.g. `auto_audit_chief_decision`). */
  capability: string;
  /** The actor whose emission was blocked (e.g. `cardio`). */
  actor: string;
  /** Cluster / subject id the denied packet was bound to. */
  cluster_id?: string;
  /** The decision label that would have been emitted if not denied. */
  blocked_decision?: string;
  /** Human-readable reason from `PermissionEntry.reason`. */
  permission_reason?: string;
  /** One-line summary suitable for narrow pill display. */
  summary?: string;
};

// ---------------------------------------------------------------------------
// Convenience helpers (pure — safe to import in tests + components)
// ---------------------------------------------------------------------------

/**
 * Extract recent permission denials from a `LedgerSummary`-shaped record list.
 *
 * Filters records whose `summary` string starts with the
 * `permission_denial_recorded:` discriminator (the Python writer in
 * `multifleet.chief_audit._record_permission_denial` always writes a
 * `summary` field with that prefix). Falls back gracefully when the
 * ledger summary is missing — returns an empty list rather than throwing.
 *
 * @param records `LedgerSummary.records` — see `lib/ide/campaign-types.ts`.
 * @param limit   Cap the returned tail (default 5 — matches the pill row UI).
 *
 * Implementation note: the summary string is the only stable signal in the
 * existing T1 bridge. Z4+ adds a typed `event_type` field to
 * `LedgerSummaryEntry`; this helper will be updated to prefer that field
 * when present.
 */
export function extractRecentPermissionDenials(
  records: ReadonlyArray<{
    record_id: string;
    kind: string;
    created_at: string;
    summary?: string;
  }>,
  limit: number = 5,
): PermissionDenialEntry[] {
  const out: PermissionDenialEntry[] = [];
  if (!records || records.length === 0) return out;
  const PREFIX = 'permission_denial_recorded';
  for (const r of records) {
    const sum = (r.summary ?? '').trim();
    if (!sum.startsWith(PREFIX)) continue;
    // Best-effort parse: "permission_denial_recorded: <actor>/<capability>
    //                    blocked decision=<X> cluster=<Y>"
    let actor = 'unknown';
    let capability = 'unknown';
    let blocked = '';
    let cluster = '';
    const m = sum.match(
      /^permission_denial_recorded:\s+([^/]+)\/(\S+)(?:\s+blocked\s+decision=(\S+))?(?:\s+cluster=(\S+))?/,
    );
    if (m) {
      actor = m[1] ?? actor;
      capability = m[2] ?? capability;
      blocked = m[3] ?? '';
      cluster = m[4] ?? '';
    }
    out.push({
      record_id: r.record_id,
      created_at: r.created_at,
      capability,
      actor,
      cluster_id: cluster || undefined,
      blocked_decision: blocked || undefined,
      summary: sum,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Sum entries by status. Useful for dashboards / counters. */
export function statusCounts(
  map: PermissionMap,
): Record<PermissionStatus, number> {
  const counts: Record<PermissionStatus, number> = {
    granted: 0,
    denied: 0,
    degraded: 0,
  };
  for (const entry of map.entries) {
    counts[entry.status] += 1;
  }
  return counts;
}

/**
 * Top N capabilities by deny-count. Z2 indicator pill uses this to surface
 * the "loudest" permission denials in CampaignTheater.
 */
export function topDeniedCapabilities(
  map: PermissionMap,
  n: number = 3,
): Array<{ capability: string; deny_count: number; status: PermissionStatus }> {
  const tally = new Map<string, number>();
  // Track a representative status for the pill — the WORST status seen for
  // that capability, with `denied` outranking `degraded` outranking `granted`.
  const worst = new Map<string, PermissionStatus>();
  const rank: Record<PermissionStatus, number> = {
    denied: 2,
    degraded: 1,
    granted: 0,
  };
  for (const entry of map.entries) {
    if (entry.status === 'denied') {
      tally.set(entry.capability, (tally.get(entry.capability) ?? 0) + 1);
    }
    const current = worst.get(entry.capability);
    if (current === undefined || rank[entry.status] > rank[current]) {
      worst.set(entry.capability, entry.status);
    }
  }
  // If nothing is denied, fall back to the worst-status capabilities so the
  // pill still surfaces signal.
  const candidates =
    tally.size > 0
      ? Array.from(tally.entries()).map(([capability, deny_count]) => ({
          capability,
          deny_count,
          status: worst.get(capability) ?? 'granted',
        }))
      : Array.from(worst.entries()).map(([capability, status]) => ({
          capability,
          deny_count: 0,
          status,
        }));
  return candidates
    .sort((a, b) => {
      if (b.deny_count !== a.deny_count) return b.deny_count - a.deny_count;
      // Tiebreak by worst-status, then by capability name for determinism.
      const sa = rank[a.status];
      const sb = rank[b.status];
      if (sb !== sa) return sb - sa;
      return a.capability.localeCompare(b.capability);
    })
    .slice(0, n);
}
