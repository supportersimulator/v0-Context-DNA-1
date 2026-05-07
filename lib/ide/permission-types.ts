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
// Convenience helpers (pure — safe to import in tests + components)
// ---------------------------------------------------------------------------

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
