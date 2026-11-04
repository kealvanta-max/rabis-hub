/**
 * Supabase data access layer.
 *
 * The app was originally written against Firestore, so this module exposes a
 * small, deliberately boring Firestore-shaped API (`collection`, `doc`,
 * `getDocs`, `setDoc`, …) on top of Postgres/Supabase. Every call maps a
 * camelCase "document" onto a snake_case table, so page code stays readable
 * while the database is properly relational, indexed and protected by RLS.
 *
 * Mapping rules live in COLLECTIONS below — add a field there once and both
 * read and write paths pick it up.
 */
import { supabase } from "@/lib/supabase";

/* -------------------------------------------------------------------------- */
/*  Timestamp                                                                 */
/* -------------------------------------------------------------------------- */

/** Drop-in replacement for Firestore's `Timestamp` (toMillis/toDate/seconds). */
export class Timestamp {
  readonly milliseconds: number;
  readonly seconds: number;

  constructor(milliseconds: number) {
    this.milliseconds = milliseconds;
    this.seconds = Math.floor(milliseconds / 1000);
  }

  static now() {
    return new Timestamp(Date.now());
  }

  static fromDate(date: Date) {
    return new Timestamp(date.getTime());
  }

  static fromMillis(milliseconds: number) {
    return new Timestamp(milliseconds);
  }

  toMillis() {
    return this.milliseconds;
  }

  toDate() {
    return new Date(this.milliseconds);
  }

  toString() {
    return this.toDate().toISOString();
  }
}

/* -------------------------------------------------------------------------- */
/*  Collection <-> table mapping                                              */
/* -------------------------------------------------------------------------- */

interface CollectionConfig {
  table: string;
  /** document field -> column */
  columns: Record<string, string>;
  /** document fields that hold timestamps */
  timestamps: string[];
}

const COLLECTIONS: Record<string, CollectionConfig> = {
  users: {
    table: "profiles",
    columns: {
      id: "id",
      name: "name",
      email: "email",
      phone: "phone",
      location: "location",
      plan: "plan",
      plans: "plans",
      gpsLat: "gps_lat",
      gpsLng: "gps_lng",
      gpsAddress: "gps_address",
      ghanaCardNumber: "ghana_card_number",
      ghanaCardValid: "ghana_card_valid",
      ghanaCardFront: "ghana_card_front",
      ghanaCardBack: "ghana_card_back",
      ghanaCardOcrResult: "ghana_card_ocr_result",
      passportPhoto: "passport_photo",
      faceScanVideo: "face_scan_video",
      status: "status",
      whatsappLink: "whatsapp_link",
      isAdmin: "is_admin",
      termsAccepted: "terms_accepted",
      termsAcceptedAt: "terms_accepted_at",
      createdAt: "created_at",
    },
    timestamps: ["termsAcceptedAt", "createdAt"],
  },
  "susu-rounds": {
    table: "susu_rounds",
    columns: {
      id: "id",
      planId: "plan_id",
      planName: "plan_name",
      roundNumber: "round_number",
      status: "status",
      cashoutDate: "cashout_date",
      momoNumber: "momo_number",
      momoName: "momo_name",
      slots: "slots",
      totalSlots: "total_slots",
      memberIds: "member_ids",
      createdAt: "created_at",
    },
    timestamps: ["cashoutDate", "createdAt"],
  },
  "payment-reports": {
    table: "payment_reports",
    columns: {
      id: "id",
      roundId: "round_id",
      userId: "user_id",
      userName: "user_name",
      amount: "amount",
      momoRef: "momo_ref",
      roundNumber: "round_number",
      reportedAt: "reported_at",
      confirmed: "confirmed",
      confirmedAt: "confirmed_at",
      confirmedBy: "confirmed_by",
    },
    timestamps: ["reportedAt", "confirmedAt"],
  },
  testimonials: {
    table: "testimonials",
    columns: {
      id: "id",
      userId: "user_id",
      userName: "user_name",
      userPhoto: "user_photo",
      planName: "plan_name",
      rating: "rating",
      review: "review",
      status: "status",
      isStatic: "is_static",
      createdAt: "created_at",
    },
    timestamps: ["createdAt"],
  },
  announcements: {
    table: "announcements",
    columns: {
      id: "id",
      title: "title",
      message: "message",
      planId: "plan_id",
      createdAt: "created_at",
    },
    timestamps: ["createdAt"],
  },
};

/** `settings/{key}` documents are stored in the `app_settings` key/value table. */
const SETTINGS_COLLECTION = "settings";

/* -------------------------------------------------------------------------- */
/*  Reference + constraint types                                              */
/* -------------------------------------------------------------------------- */

type FilterOp = "==" | "array-contains" | "in";

interface Filter {
  field: string;
  op: FilterOp;
  value: unknown;
}

export interface CollectionRef {
  kind: "collection";
  name: string;
  filters: Filter[];
  order?: { field: string; direction: "asc" | "desc" };
  max?: number;
}

export interface DocumentRef {
  kind: "document";
  name: string;
  id: string;
}

interface Constraint {
  kind: "filter" | "order" | "limit";
  filter?: Filter;
  order?: { field: string; direction: "asc" | "desc" };
  max?: number;
}

type DocData = Record<string, any>;

export interface DocSnapshot<T = DocData> {
  id: string;
  exists: () => boolean;
  /** Always returns an object so call sites can spread it safely. */
  data: () => T;
}

export interface QuerySnapshot<T = DocData> {
  docs: Array<DocSnapshot<T>>;
  size: number;
  empty: boolean;
}

/** Marker returned by {@link arrayUnion}; resolved on write. */
class ArrayUnion {
  constructor(readonly values: unknown[]) {}
}

export function arrayUnion(...values: unknown[]) {
  return new ArrayUnion(values) as unknown;
}

/* -------------------------------------------------------------------------- */
/*  Ref builders (Firestore-compatible signatures)                            */
/* -------------------------------------------------------------------------- */

export const db = { __brand: "supabase" } as const;

export function collection(_db: unknown, name: string): CollectionRef {
  return { kind: "collection", name, filters: [] };
}

export function doc(_db: unknown, name: string, id: string): DocumentRef {
  return { kind: "document", name, id };
}

export function where(field: string, op: FilterOp, value: unknown): Constraint {
  return { kind: "filter", filter: { field, op, value } };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc"): Constraint {
  return { kind: "order", order: { field, direction } };
}

export function limit(max: number): Constraint {
  return { kind: "limit", max };
}

export function query(ref: CollectionRef, ...constraints: Constraint[]): CollectionRef {
  const next: CollectionRef = { ...ref, filters: [...ref.filters] };
  for (const constraint of constraints) {
    if (constraint.kind === "filter" && constraint.filter) next.filters.push(constraint.filter);
    if (constraint.kind === "order" && constraint.order) next.order = constraint.order;
    if (constraint.kind === "limit" && typeof constraint.max === "number") next.max = constraint.max;
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/*  Row <-> document conversion                                               */
/* -------------------------------------------------------------------------- */

function settingsConfig(): CollectionConfig {
  return {
    table: "app_settings",
    columns: { key: "key", value: "value" },
    timestamps: [],
  };
}

function configFor(name: string): CollectionConfig {
  if (name === SETTINGS_COLLECTION) return settingsConfig();
  const config = COLLECTIONS[name];
  if (!config) throw new Error(`Unknown collection: ${name}`);
  return config;
}

function isTimestamp(value: unknown): value is Timestamp {
  return value instanceof Timestamp;
}

function toRow(name: string, data: Record<string, unknown>): Record<string, unknown> {
  const config = configFor(name);
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const column = config.columns[key];
    if (!column) continue;
    if (key === "plans" && value instanceof ArrayUnion) continue; // handled via RPC
    if (isTimestamp(value)) row[column] = value.toDate().toISOString();
    else if (value instanceof Date) row[column] = value.toISOString();
    else row[column] = value;
  }
  return row;
}

function toDoc<T>(name: string, row: Record<string, unknown>): T {
  const config = configFor(name);
  const reverse: Record<string, string> = {};
  for (const [key, column] of Object.entries(config.columns)) reverse[column] = key;

  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    const key = reverse[column] ?? column;
    if (config.timestamps.includes(key) && typeof value === "string") {
      const ms = Date.parse(value);
      out[key] = Number.isNaN(ms) ? null : Timestamp.fromMillis(ms);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

function columnFor(name: string, field: string): string {
  return configFor(name).columns[field] ?? field;
}

function wrapError(error: { message: string } | null): never {
  throw new Error(error?.message ?? "Database request failed");
}

/* -------------------------------------------------------------------------- */
/*  Reads                                                                     */
/* -------------------------------------------------------------------------- */

export async function getDocs<T = DocData>(
  ref: CollectionRef
): Promise<QuerySnapshot<T>> {
  const config = configFor(ref.name);

  // `app_settings` is a key/value table, not a document store.
  if (ref.name === SETTINGS_COLLECTION) {
    const { data, error } = await supabase.from(config.table).select("*");
    if (error) wrapError(error);
    const docs = (data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: String(record.key),
        exists: () => true,
        data: () => (record.value ?? {}) as T,
      };
    });
    return { docs, size: docs.length, empty: docs.length === 0 };
  }

  let request = supabase.from(config.table).select("*");

  for (const filter of ref.filters) {
    const column = columnFor(ref.name, filter.field);
    if (filter.op === "==") request = request.eq(column, filter.value as never);
    if (filter.op === "array-contains") request = request.contains(column, [filter.value] as never);
    if (filter.op === "in") request = request.in(column, filter.value as never[]);
  }

  if (ref.order) {
    request = request.order(columnFor(ref.name, ref.order.field), {
      ascending: ref.order.direction === "asc",
    });
  }
  if (typeof ref.max === "number") request = request.limit(ref.max);

  const { data, error } = await request;
  if (error) wrapError(error);

  const docs = ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const mapped = toDoc<T>(ref.name, row);
    return {
      id: String((mapped as Record<string, unknown>).id ?? row.id),
      exists: () => true,
      data: () => mapped,
    };
  });

  return { docs, size: docs.length, empty: docs.length === 0 };
}

export async function getDoc<T = DocData>(ref: DocumentRef): Promise<DocSnapshot<T>> {
  const config = configFor(ref.name);

  if (ref.name === SETTINGS_COLLECTION) {
    const { data, error } = await supabase
      .from(config.table)
      .select("value")
      .eq("key", ref.id)
      .maybeSingle();
    if (error) wrapError(error);
    return {
      id: ref.id,
      exists: () => Boolean(data),
      data: () => ((data ? (data as Record<string, unknown>).value : {}) ?? {}) as T,
    };
  }

  const { data, error } = await supabase
    .from(config.table)
    .select("*")
    .eq("id", ref.id)
    .maybeSingle();
  if (error) wrapError(error);

  return {
    id: ref.id,
    exists: () => Boolean(data),
    data: () => (data ? toDoc<T>(ref.name, data as Record<string, unknown>) : ({} as T)),
  };
}

/* -------------------------------------------------------------------------- */
/*  Writes                                                                    */
/* -------------------------------------------------------------------------- */

export async function addDoc(ref: CollectionRef, data: Record<string, unknown>) {
  const config = configFor(ref.name);
  const row = toRow(ref.name, data);

  if (ref.name === SETTINGS_COLLECTION) {
    const key = String(data.key ?? data.id ?? "");
    const { error } = await supabase
      .from(config.table)
      .upsert({ key, value: data.value ?? {} }, { onConflict: "key" });
    if (error) wrapError(error);
    return { id: key };
  }

  const { data: inserted, error } = await supabase
    .from(config.table)
    .insert(row)
    .select("id")
    .single();
  if (error) wrapError(error);
  return { id: String((inserted as Record<string, unknown>).id) };
}

export async function setDoc(
  ref: DocumentRef,
  data: Record<string, unknown>,
  _options?: { merge?: boolean }
) {
  const config = configFor(ref.name);

  if (ref.name === SETTINGS_COLLECTION) {
    const { error } = await supabase
      .from(config.table)
      .upsert({ key: ref.id, value: data, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) wrapError(error);
    return;
  }

  const row = { ...toRow(ref.name, data), id: ref.id };
  const { error } = await supabase.from(config.table).upsert(row, { onConflict: "id" });
  if (error) wrapError(error);
}

export async function updateDoc(ref: DocumentRef, data: Record<string, unknown>) {
  const config = configFor(ref.name);

  if (ref.name === SETTINGS_COLLECTION) {
    const existing = await getDoc<Record<string, unknown>>(ref);
    const merged = { ...(existing.data() ?? {}), ...data };
    await setDoc(ref, merged, { merge: true });
    return;
  }

  // Array append on the member's own plan list goes through a SECURITY DEFINER
  // RPC so a member never needs table-wide write access.
  const planUnion = data.plans;
  if (planUnion instanceof ArrayUnion && ref.name === "users") {
    const plan = String(planUnion.values[0] ?? "");
    if (plan) {
      const { error } = await supabase.rpc("append_my_plan", { p_plan: plan });
      if (error) wrapError(error);
    }
  }

  const row = toRow(ref.name, data);
  if (Object.keys(row).length === 0) return;

  const { error } = await supabase.from(config.table).update(row).eq("id", ref.id);
  if (error) wrapError(error);
}

export async function deleteDoc(ref: DocumentRef) {
  const config = configFor(ref.name);

  if (ref.name === SETTINGS_COLLECTION) {
    const { error } = await supabase.from(config.table).delete().eq("key", ref.id);
    if (error) wrapError(error);
    return;
  }

  const { error } = await supabase.from(config.table).delete().eq("id", ref.id);
  if (error) wrapError(error);
}

/* -------------------------------------------------------------------------- */
/*  Helpers used outside the document API                                     */
/* -------------------------------------------------------------------------- */

/** Maps a raw `profiles` row to the `UserDoc` shape used across the UI. */
export function mapProfileRow<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  return toDoc<T>("users", row);
}

/** Appends a plan to the signed-in member's plan list. */
export async function appendMyPlan(planId: string) {
  const { error } = await supabase.rpc("append_my_plan", { p_plan: planId });
  if (error) wrapError(error);
}
