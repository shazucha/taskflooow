import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client – publishable (anon) credentials.
 * Anon key je verejný kľúč chránený Row-Level Security politikami v DB.
 */
export const SUPABASE_URL = "https://kpypflyulfrduyagbrcv.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtweXBmbHl1bGZyZHV5YWdicmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzcxMDAsImV4cCI6MjA5MjAxMzEwMH0.uCHPbEys_T5hg06Z909PcS5zwhZuFFh14J4bVz972v8";

export const isSupabaseConfigured = true;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Database = unknown;
