import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn("⚠️ Warning: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables are missing. Please add them to your .env.local file.");
}

// Client-side Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Admin Supabase (bypasses RLS)
// NEVER import this in client components
export const supabaseAdmin = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)
    ? createClient(supabaseUrl, (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)!, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : supabase;
