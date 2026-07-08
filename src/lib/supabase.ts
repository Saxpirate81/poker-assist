import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from './config'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    client = createClient(getSupabaseUrl(), getSupabaseAnonKey())
  }
  return client
}

export function resetSupabaseClient(): void {
  client = null
}
