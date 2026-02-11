// =============================================================================
// Platform abstraction layer — barrel export
// =============================================================================

// Detection
export type { OS, Runtime, PlatformInfo } from './env-detect';
export { detectPlatform, getPlatform, _resetPlatformCache } from './env-detect';

// API
export type { FileInfo, GitStatusResult, ExecResult, PlatformAPI } from './platform-api';
export { PlatformUnavailableError, getPlatformAPI, _resetPlatformAPI } from './platform-api';
