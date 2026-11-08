import type { EmailActor } from "@/lib/email-policy";

/**
 * Server-side identity for API routes.
 *
 * The Firebase client SDK signs users in, but a route handler cannot trust a
 * header that simply says "I am admin". Google's Identity Toolkit `accounts:lookup`
 * endpoint validates the ID token (signature, audience, expiry) and returns the
 * account together with its custom claims — so this works with the public web
 * API key we already ship, with no service-account key on the server.
 */
export interface ServerUser extends EmailActor {
  token: string;
}

interface LookupResponse {
  users?: {
    localId: string;
    email?: string;
    emailVerified?: boolean;
    customAttributes?: string;
  }[];
}

function firebaseKey(): string | null {
  return (
    process.env.FIREBASE_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    null
  );
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function authenticateRequest(request: Request): Promise<ServerUser | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const key = firebaseKey();
  if (!key) {
    console.error("[auth] FIREBASE_API_KEY is not configured; rejecting protected request.");
    return null;
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        cache: "no-store",
      }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as LookupResponse;
    const account = data.users?.[0];
    if (!account?.localId) return null;

    let claimAdmin = false;
    if (account.customAttributes) {
      try {
        claimAdmin = JSON.parse(account.customAttributes)?.admin === true;
      } catch {
        claimAdmin = false;
      }
    }

    const email = account.email ?? null;
    const emailVerified = Boolean(account.emailVerified);

    return {
      uid: account.localId,
      email,
      emailVerified,
      admin: claimAdmin,
      token,
    };
  } catch (error) {
    console.warn("[auth] token verification failed:", (error as Error).message);
    return null;
  }
}
