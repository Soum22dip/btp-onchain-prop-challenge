// =============================================================================
// Security Test Helpers
// =============================================================================

const BASE = 'http://localhost:3001';

/**
 * The tests sign tokens and call admin routes with the same secrets as the
 * backend under test, so ADMIN_SECRET and JWT_SECRET must be set in the
 * environment of the test process with the backend's values.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} must be set to run the security tests`);
  }
  return value;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    body = { success: false, error: `Non-JSON response: ${res.status}` };
  }
  return { status: res.status, body };
}

export function authHeader(jwt: string): Record<string, string> {
  return { Authorization: `Bearer ${jwt}` };
}

export function adminHeader(): Record<string, string> {
  return { 'X-Admin-Secret': requireEnv('ADMIN_SECRET') };
}

/** Sign a JWT for a given traderId + wallet. Uses JWT_SECRET from the environment. */
export async function signJwt(payload: {
  traderId: string;
  walletAddress: string;
  exp?: number;
}): Promise<string> {
  const { createSigner } = await import('fast-jwt');
  const signer = createSigner({
    key: requireEnv('JWT_SECRET'),
    expiresIn: payload.exp ?? 7 * 24 * 60 * 60 * 1000,
  });
  return signer({
    traderId: payload.traderId,
    walletAddress: payload.walletAddress,
  });
}

/** Create a challenge via the dev endpoint. Returns traderId + attemptId. */
export async function createChallenge(
  walletAddress: string,
  accountSize: number,
  attemptNumber?: number,
): Promise<{
  traderId: string;
  attemptId: string;
  phase: string;
}> {
  const { body } = await api('/api/dev/create-challenge', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, accountSize, attemptNumber }),
  });
  const d = body.data as Record<string, unknown>;
  return {
    traderId: d.traderId as string,
    attemptId: d.attemptId as string,
    phase: d.phase as string,
  };
}

/** Open a position. Returns position id. */
export async function openPos(
  jwt: string,
  market: string,
  side: string,
  sizeUsd: number,
): Promise<string> {
  const { body } = await api('/api/positions', {
    method: 'POST',
    headers: authHeader(jwt),
    body: JSON.stringify({ market, side, sizeUsd }),
  });
  return (body.data as Record<string, unknown>)?.id as string;
}

/** Wait for the backend to be healthy. */
export async function waitForServer(
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Server did not become healthy within timeout');
}
