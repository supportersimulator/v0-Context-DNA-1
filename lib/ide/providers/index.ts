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
import type { IntegrationProvider } from '../integration-manifest';

export const ALL_PROVIDERS: IntegrationProvider[] = [
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
];
