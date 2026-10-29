import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type { Database, Json } from "./database.types";

/**
 * Supabase client typed against the generated schema (`pnpm db:types`).
 * Every repository takes one, so the same code runs as the signed-in owner
 * (RLS applies) or as the service role (workers, scripts).
 */
export type Db = SupabaseClient<Database>;

/** Row type of a public table, e.g. `Row<"companies">`. */
export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

/** Insert type of a public table, e.g. `Insert<"companies">`. */
export type Insert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
