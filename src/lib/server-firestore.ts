/**
 * Server-side access to member documents.
 *
 * The notification routes must read the member record from Firestore rather
 * than trusting the browser. Two paths, in order of preference:
 *
 * 1. The Admin SDK, when `FIREBASE_SERVICE_ACCOUNT_KEY` (or `SERVICE_ACCOUNT`)
 *    is present. It ignores security rules, so it can read any member and it is
 *    the only path that can stamp bookkeeping fields on somebody else's record.
 * 2. The Firestore REST API with the caller's own Firebase ID token. Rules
 *    still apply, so an admin token can read the member and a member token can
 *    read itself. Nothing here ever bypasses a rule by accident.
 *
 * When neither is available the caller gets `null` and the route fails closed:
 * it refuses to send mail built from client-supplied profile data.
 */

import { parseServiceAccount, serviceAccountRaw } from "@/lib/service-account";

const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  "rabi-hub";

/** Firestore project this server talks to. Used by the rules probe. */
export function firestoreProjectId(): string {
  return PROJECT_ID;
}

const REST_ROOT = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
  PROJECT_ID
)}/databases/(default)/documents`;

export interface MemberRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  plan: string;
  plans: string[];
  status: "pending" | "approved" | "rejected";
  whatsappLink: string;
  adminAlertAt: unknown;
  decisionEmailAt: unknown;
  decisionEmailFor: string | null;
  raw: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Admin SDK                                                          */
/* ------------------------------------------------------------------ */

type AdminFirestore = import("firebase-admin/firestore").Firestore;

let cachedDb: AdminFirestore | null | undefined;

/*
 * Parsing lives in `service-account.ts` so the diagnosis route and the code that
 * actually builds the credential cannot disagree about what a valid key is.
 * Everything below is about getting a live handle from a parsed key.
 */

/**
 * The Admin SDK handle, or null when no service account is configured.
 * Cached per instance, including the failure case, so a cold lambda does not
 * retry a broken key on every request.
 */
export async function adminFirestore(): Promise<AdminFirestore | null> {
  if (cachedDb !== undefined) return cachedDb;

  const raw = serviceAccountRaw();
  if (!raw) {
    cachedDb = null;
    return cachedDb;
  }

  const credentials = parseServiceAccount(raw);
  if (!credentials) {
    console.warn("[firestore] service account is set but could not be parsed; admin writes are disabled.");
    cachedDb = null;
    return cachedDb;
  }

  try {
    const { getApps, initializeApp, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");

    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert(credentials as Parameters<typeof cert>[0]),
        projectId: String(credentials.project_id),
      });

    cachedDb = getFirestore(app);
    return cachedDb;
  } catch (error) {
    console.warn("[firestore] admin SDK unavailable:", (error as Error).message);
    cachedDb = null;
    return cachedDb;
  }
}

/* ------------------------------------------------------------------ */
/* REST                                                               */
/* ------------------------------------------------------------------ */

/** Flattens Firestore's typed REST values into plain JSON. */
function decodeValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const typed = value as Record<string, unknown>;

  if ("stringValue" in typed) return typed.stringValue;
  if ("booleanValue" in typed) return typed.booleanValue;
  if ("integerValue" in typed) return Number(typed.integerValue);
  if ("doubleValue" in typed) return Number(typed.doubleValue);
  if ("timestampValue" in typed) return typed.timestampValue;
  if ("nullValue" in typed) return null;
  if ("arrayValue" in typed) {
    const array = typed.arrayValue as { values?: unknown[] } | undefined;
    return (array?.values ?? []).map(decodeValue);
  }
  if ("mapValue" in typed) {
    const map = typed.mapValue as { fields?: Record<string, unknown> } | undefined;
    return decodeFields(map?.fields);
  }
  return null;
}

function decodeFields(fields: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    out[key] = decodeValue(value);
  }
  return out;
}

function toMember(id: string, data: Record<string, unknown>): MemberRecord {
  const status = data.status === "approved" || data.status === "rejected" ? data.status : "pending";

  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    email: typeof data.email === "string" ? data.email : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    plan: typeof data.plan === "string" ? data.plan : "",
    plans: Array.isArray(data.plans) ? data.plans.filter((plan): plan is string => typeof plan === "string") : [],
    status,
    whatsappLink: typeof data.whatsappLink === "string" ? data.whatsappLink : "",
    adminAlertAt: data.adminAlertAt ?? null,
    decisionEmailAt: data.decisionEmailAt ?? null,
    decisionEmailFor: typeof data.decisionEmailFor === "string" ? data.decisionEmailFor : null,
    raw: data,
  };
}

/**
 * Reads one member. `token` is the caller's Firebase ID token, used for the REST
 * path so that rules decide what is visible.
 */
export async function readMember(uid: string, token?: string): Promise<MemberRecord | null> {
  if (!uid) return null;

  const db = await adminFirestore();
  if (db) {
    try {
      const snapshot = await db.collection("users").doc(uid).get();
      if (!snapshot.exists) return null;
      return toMember(uid, snapshot.data() ?? {});
    } catch (error) {
      console.warn("[firestore] admin read failed, trying REST:", (error as Error).message);
    }
  }

  if (!token) return null;

  try {
    const response = await fetch(`${REST_ROOT}/users/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("[firestore] member read denied", { uid, status: response.status });
      return null;
    }

    const body = (await response.json()) as { fields?: Record<string, unknown> };
    return toMember(uid, decodeFields(body.fields));
  } catch (error) {
    console.warn("[firestore] REST read failed:", (error as Error).message);
    return null;
  }
}

/**
 * Merges bookkeeping fields into a member document.
 *
 * Admin only by construction: either the Admin SDK is available, or this
 * returns false and the caller reports that the record could not be stamped.
 * It never falls back to a member token, because rules would reject the write
 * and a half-recorded state is worse than an honest "not recorded".
 */
export async function stampMember(uid: string, patch: Record<string, unknown>): Promise<boolean> {
  if (!uid || Object.keys(patch).length === 0) return false;

  const db = await adminFirestore();
  if (!db) return false;

  try {
    await db.collection("users").doc(uid).set(patch, { merge: true });
    return true;
  } catch (error) {
    console.warn("[firestore] could not stamp member:", (error as Error).message);
    return false;
  }
}

/**
 * Custom plan id to display name, so a member on a plan Rabi created reads a
 * real label in their email instead of `custom-1793847881969`.
 * Empty when the Admin SDK is not configured; callers fall back to the built in
 * labels, which is cosmetic and never fatal.
 */
export async function customPlanNames(): Promise<Record<string, string>> {
  const db = await adminFirestore();
  if (!db) return {};

  try {
    const snapshot = await db.collection("settings").doc("customPlans").get();
    const plans = snapshot.exists ? (snapshot.data()?.plans as unknown) : null;
    if (!Array.isArray(plans)) return {};

    const names: Record<string, string> = {};
    for (const plan of plans) {
      if (!plan || typeof plan !== "object") continue;
      const entry = plan as { id?: unknown; name?: unknown };
      if (typeof entry.id === "string" && typeof entry.name === "string") {
        names[entry.id] = entry.name;
      }
    }
    return names;
  } catch (error) {
    console.warn("[firestore] custom plan read failed:", (error as Error).message);
    return {};
  }
}

/**
 * Pending members that have never produced an admin alert. Used by the admin
 * sweep, so an alert lost to a closed tab shows up later instead of vanishing.
 */
export async function pendingMembersWithoutAlert(limit = 25): Promise<MemberRecord[]> {
  const db = await adminFirestore();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection("users")
      .where("status", "==", "pending")
      .limit(Math.min(Math.max(limit, 1), 100))
      .get();

    // Spelled out rather than inferred: the admin SDK's query snapshot types
    // resolve differently depending on how the package is installed, and an
    // implicit any here fails the CI type check while passing locally.
    const docs = snapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>;

    return docs
      .map((doc) => toMember(doc.id, doc.data()))
      .filter((member) => !member.adminAlertAt);
  } catch (error) {
    console.warn("[firestore] pending sweep failed:", (error as Error).message);
    return [];
  }
}
