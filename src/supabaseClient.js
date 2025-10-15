import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://kvyiuwbgxwhaaxbglxyz.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eWl1d2JneHdoYWF4YmdseHl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMjAzNzYsImV4cCI6MjA3NTU5NjM3Nn0.ktrdRtjMc82lbN-UBGknc1D_bHTKGVpoWGTh7VcSdAU";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
