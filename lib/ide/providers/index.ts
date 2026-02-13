// =============================================================================
// providers/index.ts — Re-exports all integration providers
//
// Import all providers from one place:
//   import { EASProvider, VercelProvider } from '@/lib/ide/providers';
// =============================================================================

// App Development
export { EASProvider } from './eas-provider';
export { AppStoreConnectProvider } from './appstore-connect-provider';

// Container / Registry
export { DockerHubProvider } from './docker-hub-provider';
export { NpmRegistryProvider } from './npm-registry-provider';

// Compute
export { OllamaProvider } from './ollama-provider';
export { StackBlitzProvider } from './stackblitz-provider';

// Deploy
export { VercelProvider } from './vercel-provider';

// CI/CD
export { GitHubActionsProvider } from './github-actions-provider';

// Observability
export { SentryProvider } from './sentry-provider';

// ML
export { KaggleProvider } from './kaggle-provider';
export { WandBProvider } from './wandb-provider';

// VCS
export { GitLabProvider } from './gitlab-provider';

// ML (additional)
export { HuggingFaceProvider } from './huggingface-provider';

// Automation
export { NodeREDProvider } from './nodered-provider';

// Compute (additional)
export { LMStudioProvider } from './lm-studio-provider';
export { OpenRouterProvider } from './openrouter-provider';

// System
export { MCPClientBridge } from '../mcp-client-bridge';
export { HomebrewProvider } from './homebrew-provider';
export { SystemMonitorProvider } from './system-monitor-provider';
export { LaunchAgentManagerProvider } from './launchagent-manager-provider';

// IDE
export { VSCodeBridgeProvider } from './vscode-bridge-provider';

// ---------------------------------------------------------------------------
// ALL_PROVIDERS — convenience array for bulk registration
// ---------------------------------------------------------------------------

import { EASProvider } from './eas-provider';
import { AppStoreConnectProvider } from './appstore-connect-provider';
import { DockerHubProvider } from './docker-hub-provider';
import { NpmRegistryProvider } from './npm-registry-provider';
import { OllamaProvider } from './ollama-provider';
import { StackBlitzProvider } from './stackblitz-provider';
import { VercelProvider } from './vercel-provider';
import { GitHubActionsProvider } from './github-actions-provider';
import { SentryProvider } from './sentry-provider';
import { KaggleProvider } from './kaggle-provider';
import { WandBProvider } from './wandb-provider';
import { GitLabProvider } from './gitlab-provider';
import { MCPClientBridge } from '../mcp-client-bridge';
import { HuggingFaceProvider } from './huggingface-provider';
import { NodeREDProvider } from './nodered-provider';
import { LMStudioProvider } from './lm-studio-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { HomebrewProvider } from './homebrew-provider';
import { SystemMonitorProvider } from './system-monitor-provider';
import { VSCodeBridgeProvider } from './vscode-bridge-provider';
import { LaunchAgentManagerProvider } from './launchagent-manager-provider';
import type { IntegrationProvider } from '../integration-manifest';

export const ALL_PROVIDERS: IntegrationProvider[] = [
  // Original 12
  EASProvider,
  AppStoreConnectProvider,
  DockerHubProvider,
  NpmRegistryProvider,
  OllamaProvider,
  StackBlitzProvider,
  VercelProvider,
  GitHubActionsProvider,
  SentryProvider,
  KaggleProvider,
  WandBProvider,
  GitLabProvider,
  MCPClientBridge,
  // Expanded 8 (additive-only — zero changes above this line)
  HuggingFaceProvider,
  NodeREDProvider,
  LMStudioProvider,
  OpenRouterProvider,
  HomebrewProvider,
  SystemMonitorProvider,
  VSCodeBridgeProvider,
  LaunchAgentManagerProvider,
];
