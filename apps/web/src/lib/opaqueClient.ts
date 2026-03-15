/**
 * OPAQUE Zero-Knowledge Authentication Client Helper
 *
 * Wraps @serenity-kit/opaque client functions for StenVault.
 * OPAQUE (RFC 9807) ensures the server NEVER sees the user's password.
 */
import * as opaque from "@serenity-kit/opaque";

/**
 * Ensure OPAQUE WASM is initialized before use.
 */
async function ensureReady(): Promise<void> {
  await opaque.ready;
}

// ============================================
// Registration (Client Side)
// ============================================

export interface ClientRegistrationStart {
  clientRegistrationState: string;
  registrationRequest: string;
}

/**
 * Start client-side registration.
 * Step 1: generates registrationRequest to send to server.
 */
export async function startRegistration(
  password: string
): Promise<ClientRegistrationStart> {
  await ensureReady();
  const result = opaque.client.startRegistration({ password });
  return {
    clientRegistrationState: result.clientRegistrationState,
    registrationRequest: result.registrationRequest,
  };
}

export interface ClientRegistrationFinish {
  registrationRecord: string;
  exportKey: string;
  serverStaticPublicKey: string;
}

/**
 * Finish client-side registration.
 * Step 2: takes server's registrationResponse and produces registrationRecord.
 */
export async function finishRegistration(
  password: string,
  clientRegistrationState: string,
  registrationResponse: string
): Promise<ClientRegistrationFinish> {
  await ensureReady();
  const result = opaque.client.finishRegistration({
    password,
    clientRegistrationState,
    registrationResponse,
  });
  return {
    registrationRecord: result.registrationRecord,
    exportKey: result.exportKey,
    serverStaticPublicKey: result.serverStaticPublicKey,
  };
}

// ============================================
// Login (Client Side)
// ============================================

export interface ClientLoginStart {
  clientLoginState: string;
  startLoginRequest: string;
}

/**
 * Start client-side login.
 * Step 1: generates startLoginRequest to send to server.
 */
export async function startLogin(
  password: string
): Promise<ClientLoginStart> {
  await ensureReady();
  const result = opaque.client.startLogin({ password });
  return {
    clientLoginState: result.clientLoginState,
    startLoginRequest: result.startLoginRequest,
  };
}

export interface ClientLoginFinish {
  finishLoginRequest: string;
  sessionKey: string;
  exportKey: string;
  serverStaticPublicKey: string;
}

/**
 * Finish client-side login.
 * Step 2: takes server's loginResponse and produces finishLoginRequest.
 * Returns undefined if password is wrong (OPAQUE rejects).
 */
export async function finishLogin(
  password: string,
  clientLoginState: string,
  loginResponse: string
): Promise<ClientLoginFinish | undefined> {
  await ensureReady();
  const result = opaque.client.finishLogin({
    password,
    clientLoginState,
    loginResponse,
  });

  if (!result) return undefined;

  return {
    finishLoginRequest: result.finishLoginRequest,
    sessionKey: result.sessionKey,
    exportKey: result.exportKey,
    serverStaticPublicKey: result.serverStaticPublicKey,
  };
}
