import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && "REACT_APP_SUPABASE_URL",
    !supabaseAnonKey && "REACT_APP_SUPABASE_ANON_KEY",
  ].filter(Boolean);

  throw new Error(
    `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
      "Set these values in your environment configuration (see README for details)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
