# Antigravity IDE Handoff: Injection Focus Mode

## Overview

Implement a **Focus Mode** that visualizes Context DNA injections in real-time. When the user toggles focus mode, the entire screen shows what was injected into the AI agent's context for the most recent prompt.

## Visual Goal

A beautiful, full-screen visualization showing:
- Risk level badge (color-coded: critical=red, high=orange, moderate=yellow, low=green)
- The user's original prompt that triggered the injection
- Analysis metrics (generation time, detected domains, first-try likelihood)
- Silver Platter sections (expandable cards):
  - 🛡️ Safety Rails (red) - things the agent must NEVER do
  - 🎯 THE ONE THING (cyan highlight) - the most important insight
  - 💣 Landmines (orange) - gotchas to avoid
  - 🔄 Patterns (purple) - relevant code patterns
  - 🧠 Context (blue) - historical context
  - 📋 SOPs (green, expandable) - standard operating procedures
  - 📊 Protocol - risk assessment and recommendation

## Data Types (TypeScript)

```typescript
export type RiskLevel = 'critical' | 'high' | 'moderate' | 'low';

export interface InjectionData {
  id: string;
  timestamp: string;
  trigger: {
    hook: string;           // e.g., "UserPromptSubmit"
    prompt: string;         // The user's original prompt
    session_id: string;
  };
  analysis: {
    detected_domains: string[];      // e.g., ["auth", "api", "database"]
    risk_level: RiskLevel;
    first_try_likelihood: number | string;  // e.g., "72%" or 72
    generation_time_ms: number;
    sections_included: string[];
    ab_variant: string;
    mode: string;
  };
  silver_platter: {
    safety: {
      found: boolean;
      content: string[];    // List of NEVER DO items
    };
    wisdom: {
      the_one_thing: string;
      landmines: { icon: string; text: string; }[];
      patterns: { text: string; file?: string; lines?: string; }[];
      context: string;
    };
    sops: {
      id: string;
      title: string;
      summary: string;
      relevance_score: number;  // 0-1
      full_content?: string;    // Shown when expanded
    }[];
    protocol: {
      risk_level: string;
      first_try_percent: number;
      recommendation: string;
    };
  };
  raw_output: string;  // The full formatted text (collapsible)
}

export const RISK_LEVEL_CONFIG = {
  critical: { color: 'text-red-400', bgColor: 'bg-red-500/20', label: 'CRITICAL' },
  high: { color: 'text-orange-400', bgColor: 'bg-orange-500/20', label: 'HIGH' },
  moderate: { color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', label: 'MODERATE' },
  low: { color: 'text-green-400', bgColor: 'bg-green-500/20', label: 'LOW' },
};
```

## API Endpoints

### Fetch Latest Injection
```typescript
GET http://127.0.0.1:8080/api/injection/latest
Response: InjectionData | null
```

### Fetch History
```typescript
GET http://127.0.0.1:8080/api/injection/history?limit=20
Response: InjectionHistoryItem[]
```

### WebSocket (Real-time Updates)
```typescript
WS ws://127.0.0.1:8080/ws/injections?client_id={unique_id}

// On connect, send registration:
{ type: 'register', client_id: string, platform: 'web' | 'electron', timestamp: string }

// Receive injection events:
{ event: 'injection_complete', data: InjectionData }

// Heartbeat every 30s:
{ type: 'heartbeat', client_id: string }
```

## Mock Data for Development

When the backend isn't running, use this mock data:

```typescript
const mockInjection: InjectionData = {
  id: 'inj_mock_001',
  timestamp: new Date().toISOString(),
  trigger: {
    hook: 'UserPromptSubmit',
    prompt: 'Help me debug the authentication flow in our Django backend',
    session_id: 'session_abc123',
  },
  analysis: {
    detected_domains: ['auth', 'api', 'database'],
    risk_level: 'moderate',
    first_try_likelihood: '72%',
    generation_time_ms: 847,
    sections_included: ['safety', 'wisdom', 'sops', 'protocol'],
    ab_variant: 'control',
    mode: 'hybrid',
  },
  silver_platter: {
    safety: {
      found: true,
      content: [
        '🚫 NEVER commit credentials or API keys to git',
        '🚫 NEVER disable CSRF protection without explicit approval',
      ],
    },
    wisdom: {
      the_one_thing: 'Django auth issues usually stem from middleware ordering - check MIDDLEWARE in settings.py',
      landmines: [
        { icon: '💣', text: 'Session middleware MUST come before AuthenticationMiddleware' },
        { icon: '💣', text: 'CSRF tokens expire after logout - clear cookies when testing' },
      ],
      patterns: [
        { text: 'Use @login_required decorator consistently', file: 'views.py' },
        { text: 'Check AUTH_USER_MODEL matches your custom user', file: 'settings.py' },
      ],
      context: "Based on previous sessions, you've worked with Django REST Framework auth. Remember the TokenAuthentication vs SessionAuthentication distinction.",
    },
    sops: [
      {
        id: 'sop_django_auth_debug',
        title: 'Django Authentication Debugging',
        summary: 'Step-by-step process for diagnosing auth issues',
        relevance_score: 0.94,
        full_content: '1. Check MIDDLEWARE ordering\n2. Verify AUTH_USER_MODEL\n3. Test with manage.py shell\n4. Check session backend configuration',
      },
    ],
    protocol: {
      risk_level: 'moderate',
      first_try_percent: 72,
      recommendation: 'Query memory if unsure | Record wins on success',
    },
  },
  raw_output: '╔══════════════════════════════════════════════════════════════╗\n║  🧬 CONTEXT DNA INJECTION                                      ║\n╚══════════════════════════════════════════════════════════════╝\n...',
};
```

## UI Requirements

### Focus Mode Toggle Button
- Location: Near the 🧬 brain icon in the header
- Icon: Syringe (💉) or similar injection icon
- States:
  - Normal: "Live View" - subtle, muted colors
  - Active: "Exit Focus" - primary color, pulsing animation
- Keyboard shortcut: Escape to exit focus mode

### Focus Mode Overlay
- Dims the tab bar to 40% opacity (70% on hover)
- Tabs remain clickable to exit focus mode
- Full-screen content area for injection visualization

### Visual Sections

#### Header
```
┌─────────────────────────────────────────────────────────────┐
│ [MODERATE RISK]  Context DNA Injection          72%         │
│ 2 minutes ago                                   First-Try   │
└─────────────────────────────────────────────────────────────┘
```

#### Trigger Card
```
┌─────────────────────────────────────────────────────────────┐
│ 🎯 TRIGGER                        [UserPromptSubmit]        │
│                                                             │
│ "Help me debug the authentication flow in our Django        │
│  backend"                                                   │
│                                                             │
│ Session: session_abc123                                     │
└─────────────────────────────────────────────────────────────┘
```

#### Metrics Row
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ ⚡ 847ms     │ │ 🎯 hybrid    │ │ 📄 4         │ │ 🧪 control   │
│ Gen Time     │ │ Mode         │ │ Sections     │ │ Variant      │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

#### Domain Tags
```
[ auth ] [ api ] [ database ]
```

#### Silver Platter Cards
Each section is a card with:
- Icon and title in section color
- Content below
- SOPs are expandable (click to show full_content)

### Animations
- Pulse animation when new injection arrives
- Smooth transitions between states
- Expand/collapse animations for SOPs and raw output

## Multi-IDE Support

The WebSocket implementation supports multiple IDEs connecting simultaneously:
- Each client gets a unique ID
- All connected clients receive injection broadcasts
- Heartbeat keeps connections alive
- Exponential backoff on reconnection

## Files Reference

These files in the repo show the implementation pattern:
- `lib/types.ts` - Type definitions
- `lib/api.ts` - API functions and WebSocket subscription
- `components/dashboard/views/injection-focus-view.tsx` - Reference component
- `components/dashboard/dashboard-shell.tsx` - Focus mode state management
- `components/dashboard/tab-bar.tsx` - Toggle button placement

## Design Tokens

Use the existing design system:
- Glass morphism: `glass` class for card backgrounds
- Colors: Use `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-secondary`
- Risk colors: Red (critical), Orange (high), Yellow (moderate), Green (low)
- Section colors: Cyan (one thing), Orange (landmines), Purple (patterns), Blue (context), Green (SOPs)

## Priority

1. **Must Have**: Focus mode toggle, injection visualization, real-time updates
2. **Should Have**: SOP expansion, raw output collapse, copy button
3. **Nice to Have**: Connection status indicator, injection history sidebar
