import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY?.trim();

const missingConfigMessage =
  "Supabase credentials are not configured. Define REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in your environment.";

const createMissingConfigClient = () =>
  new Proxy(
    {},
    {
      get() {
        throw new Error(missingConfigMessage);
      },
      apply() {
        throw new Error(missingConfigMessage);
      },
    }
  );

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured && typeof console !== "undefined") {
  const message =
    missingConfigMessage +
    " Visit the project README for setup instructions or update your Vercel project environment variables.";
  if (process.env.NODE_ENV !== "production") {
    console.warn(message);
  }
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMissingConfigClient();
