import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function getSupabaseConfigError() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Supabase is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  }

  try {
    const url = new URL(supabaseUrl)
    if (!url.hostname.endsWith('.supabase.co')) {
      return `Supabase URL must be a *.supabase.co host. Got: ${url.hostname}`
    }
  } catch {
    return `Supabase URL is invalid: ${supabaseUrl}`
  }

  return null
}

export const supabaseConfigError = getSupabaseConfigError()

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey)
