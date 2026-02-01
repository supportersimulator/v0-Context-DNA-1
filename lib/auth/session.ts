/**
 * Auth session helpers for Context DNA
 * Manages Supabase login, Django app JWT, and device token authentication.
 *
 * Authentication strategy:
 * - Device Token (primary): Persists forever, no expiry, like mobile app
 * - JWT (initial login only): Used once to link device token to user account
 * - After linking, device token is used for all API calls
 *
 * Brand differentiation:
 * - Uses 'contextdna_*' localStorage keys (not 'ersim_*')
 * - Backend URL: api.contextdna.io
 * - Admin user: aarontjomsland@gmail.com (vs support@ersimulator.com for ER Sim)
 */

import { supabase } from '../supabase/client';

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.contextdna.io"

// JWT storage (used during initial login only)
const APP_TOKEN_KEY = 'contextdna_app_token';
const APP_TOKEN_EXPIRY_KEY = 'contextdna_app_token_expiry';
const APP_USERNAME_KEY = 'contextdna_username';

// Device token storage (primary auth - never expires)
const DEVICE_TOKEN_KEY = 'contextdna_device_token';
const DEVICE_LINKED_KEY = 'contextdna_device_linked'; // true if linked to real account
const USER_ID_KEY = 'contextdna_user_id'; // Django user ID from device registration

// Types
export interface AuthTokenExchangeResponse {
  access: string;
  expires_in: number;
  user: {
    id: number;
    username: string;
    email: string;
    is_staff: boolean;
  };
}

/**
 * Detect if running on the admin domain (staff-only dashboard)
 * On admin domain, we trust device tokens without requiring linked status
 */
function isAdminDomain(): boolean {
  if (typeof window === 'undefined') return false;

  const hostname = window.location.hostname;
  return hostname === 'admin.contextdna.io';
}

/**
 * Detect if running in v0 preview environment
 * v0 previews run on *.v0.dev or localhost with specific patterns
 */
function isV0Preview(): boolean {
  if (typeof window === 'undefined') return false;

  const hostname = window.location.hostname;

  // v0.dev preview domains
  if (hostname.endsWith('.v0.dev')) return true;
  if (hostname.includes('v0.app')) return true;

  // Vercel preview deployments (for development testing)
  if (hostname.endsWith('.vercel.app')) return true;

  // Also check for v0's iframe sandbox
  try {
    if (window.self !== window.top) {
      // Running in iframe - likely v0 preview
      const referrer = document.referrer;
      if (referrer.includes('v0.dev') || referrer.includes('v0.app')) {
        return true;
      }
    }
  } catch (e) {
    // Cross-origin iframe - could be v0
  }

  return false;
}

/**
 * Save Django app JWT to localStorage
 * TODO: Migrate to httpOnly cookie for production
 */
export function saveAppToken(token: string, expiresIn: number): void {
  if (typeof window === 'undefined') return;

  const expiryTime = Date.now() + expiresIn * 1000;
  localStorage.setItem(APP_TOKEN_KEY, token);
  localStorage.setItem(APP_TOKEN_EXPIRY_KEY, expiryTime.toString());
}

/**
 * Get Django app JWT from localStorage
 * Returns null if expired or missing
 */
export function getAppToken(): string | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem(APP_TOKEN_KEY);
  const expiryStr = localStorage.getItem(APP_TOKEN_EXPIRY_KEY);

  if (!token || !expiryStr) return null;

  const expiry = parseInt(expiryStr, 10);
  if (Date.now() >= expiry) {
    // Token expired, clear it
    clearAppToken();
    return null;
  }

  return token;
}

/**
 * Clear Django app JWT and username from localStorage
 */
export function clearAppToken(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(APP_TOKEN_KEY);
  localStorage.removeItem(APP_TOKEN_EXPIRY_KEY);
  localStorage.removeItem(APP_USERNAME_KEY);
}

/**
 * Get stored username from localStorage (no API call needed).
 * Returns null if not logged in.
 */
export function getStoredUsername(): string | null {
  if (typeof window === 'undefined') return null;

  // Admin domain bypass - return aarontjomsland username (backend uses aarontjomsland@gmail.com)
  if (isAdminDomain()) {
    return localStorage.getItem(APP_USERNAME_KEY) || 'aarontjomsland';
  }

  // v0 preview - return aarontjomsland username (device is linked to aarontjomsland@gmail.com via proxy)
  if (isV0Preview()) {
    return 'aarontjomsland';
  }

  return localStorage.getItem(APP_USERNAME_KEY);
}

/**
 * Check if user is authenticated.
 * Priority:
 * 1. Admin domain bypass (staff-only, backend handles auth via Origin header)
 * 2. V0 preview bypass (for development)
 * 3. Device token linked to real account (primary auth)
 * 4. Valid JWT token (fallback during login flow)
 */
export function isAuthenticated(): boolean {
  // Admin domain - always authenticated (backend attaches aarontjomsland@gmail.com via Origin)
  // Device token is optional here since backend handles auth
  if (isAdminDomain()) {
    return true;
  }

  // v0 preview bypass - always authenticated for UI development
  if (isV0Preview()) {
    return true;
  }

  // Device token linked to real account = authenticated
  if (getDeviceToken() && isDeviceLinked()) {
    return true;
  }

  // Fallback to JWT (used during initial login)
  return getAppToken() !== null;
}

/**
 * Login with Supabase and exchange for Django app JWT
 */
export async function loginWithSupabase(
  email: string,
  password: string
): Promise<AuthTokenExchangeResponse['user']> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  // Step 1: Authenticate with Supabase
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw error ?? new Error('No session returned from Supabase');
  }

  const supabaseAccessToken = data.session.access_token;

  // Step 2: Exchange Supabase token for Django app JWT
  const response = await fetch(
    `${BACKEND_BASE_URL}/api/auth/exchange-supabase-token/`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAccessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || `Token exchange failed: ${response.status}`
    );
  }

  const tokenData: AuthTokenExchangeResponse = await response.json();

  // Step 3: Save Django app JWT and username
  saveAppToken(tokenData.access, tokenData.expires_in);
  if (tokenData.user.username) {
    localStorage.setItem(APP_USERNAME_KEY, tokenData.user.username);
  }

  // Step 4: Link device token to this user account
  // This enables device-based auth after JWT expires
  await linkDeviceToUser(tokenData.access);

  return tokenData.user;
}

/**
 * Sign up with Supabase
 */
export async function signupWithSupabase(
  email: string,
  password: string
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  // After signup, user typically needs to confirm email
  // The actual login + token exchange happens after confirmation
}

/**
 * Logout: Clear all auth state (Supabase, JWT, device token)
 */
export async function logout(): Promise<void> {
  // Clear Supabase session
  if (supabase) {
    await supabase.auth.signOut();
  }

  // Clear Django app JWT
  clearAppToken();

  // Clear device token (will re-register on next page load)
  if (typeof window !== 'undefined') {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    localStorage.removeItem(DEVICE_LINKED_KEY);
  }
}

// NOTE: Do NOT add getCurrentUser() or any Supabase.auth.getUser() calls here.
// Supabase should ONLY be called during:
// 1. Login (signInWithPassword) - once per session
// 2. Signup (signUp) - once per user
// 3. Logout (signOut) - once when logging out
// 4. Subscription changes (future)
// For user info, use getStoredUsername() which reads from localStorage.

// ============================================================================
// DEVICE TOKEN AUTH (Primary - never expires, like mobile app)
// ============================================================================

/**
 * Get device token from localStorage.
 * Returns null if not registered yet.
 */
export function getDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(DEVICE_TOKEN_KEY);
}

/**
 * Check if device token is linked to a real user account.
 */
export function isDeviceLinked(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DEVICE_LINKED_KEY) === 'true';
}

/**
 * Store a device token (public wrapper for voice auth).
 * Used when enrolling voice fingerprint to bind device.
 */
export function storeDeviceToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
}

/**
 * Save device token and user ID to localStorage.
 */
function saveDeviceToken(token: string, linked: boolean = false, userId?: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
  localStorage.setItem(DEVICE_LINKED_KEY, linked ? 'true' : 'false');
  if (userId !== undefined) {
    localStorage.setItem(USER_ID_KEY, String(userId));
  }
}

/**
 * Get stored user ID from localStorage.
 * Returns null if not registered yet.
 */
export function getStoredUserId(): number | null {
  if (typeof window === 'undefined') return null;
  const userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) return null;
  const parsed = parseInt(userId, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Register a new device token with the backend.
 * Called automatically on first app load if no device token exists.
 *
 * For v0 preview, uses proxy route to avoid CORS issues.
 * Backend middleware will link v0 devices to aarontjomsland@gmail.com via Origin header.
 */
export async function registerDevice(useProxy: boolean = false): Promise<string> {
  const existingToken = getDeviceToken();
  if (existingToken) {
    return existingToken;
  }

  const platform = useProxy ? 'v0-preview' : 'web-contextdna';
  const body = {
    platform,
    device_name: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : 'Context DNA Web',
    app_version: '1.0.0',
  };

  // For v0 preview, use proxy route to avoid CORS and get proper Origin header
  const url = useProxy
    ? `/api/proxy?endpoint=${encodeURIComponent('/api/auth/device/register/')}`
    : `${BACKEND_BASE_URL}/api/auth/device/register/`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Device registration failed: ${response.status}`);
  }

  const data = await response.json();
  // For v0, mark as linked since backend attaches aarontjomsland@gmail.com via Origin
  const isLinked = useProxy;
  saveDeviceToken(data.device_token, isLinked, data.user_id);
  console.log('[ContextDNA Auth] Device registered:', data.device_token.slice(0, 8) + '...', 'user_id:', data.user_id, 'linked:', isLinked);
  return data.device_token;
}

/**
 * Link device token to the authenticated user account.
 * Called after successful Supabase login to associate device with real account.
 */
async function linkDeviceToUser(jwtToken: string): Promise<void> {
  const deviceToken = getDeviceToken();
  if (!deviceToken) {
    console.warn('[ContextDNA Auth] No device token to link');
    return;
  }

  const response = await fetch(
    `${BACKEND_BASE_URL}/api/auth/device/link/`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_token: deviceToken,
        platform: 'web-contextdna',
        device_name: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : 'Context DNA Web',
        app_version: '1.0.0',
      }),
    }
  );

  if (!response.ok) {
    console.error('[ContextDNA Auth] Device link failed:', response.status);
    return;
  }

  const data = await response.json();
  saveDeviceToken(deviceToken, true, data.user_id);
  console.log('[ContextDNA Auth] Device linked to user:', data.email, 'user_id:', data.user_id);
}

/**
 * Initialize device auth on app load.
 * Registers device if not already registered.
 * On admin domain, device gets linked to aarontjomsland@gmail.com by backend.
 * On v0 preview, device is registered via proxy and linked to aarontjomsland@gmail.com.
 */
export async function initDeviceAuth(): Promise<string | null> {
  try {
    // For v0 preview, register via proxy to get proper Origin header
    // Backend middleware will attach aarontjomsland@gmail.com user
    const useProxy = isV0Preview();
    return await registerDevice(useProxy);
  } catch (error) {
    console.error('[ContextDNA Auth] Device init failed:', error);
    return null;
  }
}
