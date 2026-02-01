# Synaptic Chat Integration

## Component Created
`components/dashboard/views/synaptic-chat-view.tsx`

## To Add to Dashboard

1. **Add to TabList.tsx** - Add a new tab:
```tsx
{ id: "synaptic", label: "Synaptic", icon: Brain }
```

2. **Add to DashboardShell.tsx** - Add the view:
```tsx
import { SynapticChatView } from "./views/synaptic-chat-view";

// In the tab content switch:
case "synaptic":
  return <SynapticChatView />;
```

3. **Add to lib/types.ts** - Add tab type:
```tsx
export type TabId = "home" | "activity" | ... | "synaptic";
```

## Requirements
- Synaptic chat server running on ws://localhost:8888
- Start with: `python memory/synaptic_chat_server.py`

## Features
- WebSocket real-time messaging
- Auto-reconnect on disconnect
- Full memory access (brain, learnings, dialogue history)
- Dark mode compatible
