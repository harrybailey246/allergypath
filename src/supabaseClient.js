import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl) {
  throw new Error(
    "Missing Supabase URL. Set the REACT_APP_SUPABASE_URL environment variable (e.g. in .env.local)."
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    "Missing Supabase anon key. Set the REACT_APP_SUPABASE_ANON_KEY environment variable (e.g. in .env.local)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
