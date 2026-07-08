const DEVICE_KEY = 'poker-assist-device-id'
const GEMINI_KEY = 'poker-assist-gemini-key'
const OPENAI_KEY = 'poker-assist-openai-key'
const SUPABASE_URL_KEY = 'poker-assist-supabase-url'
const SUPABASE_ANON_KEY = 'poker-assist-supabase-anon-key'
const AI_PROVIDER_KEY = 'poker-assist-ai-provider'

export type AiProvider = 'gemini' | 'openai' | 'rules'

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export function getGeminiApiKey(): string {
  return localStorage.getItem(GEMINI_KEY) ?? import.meta.env.VITE_GEMINI_API_KEY ?? ''
}

export function setGeminiApiKey(key: string): void {
  localStorage.setItem(GEMINI_KEY, key)
}

export function getOpenAiApiKey(): string {
  return localStorage.getItem(OPENAI_KEY) ?? import.meta.env.VITE_OPENAI_API_KEY ?? ''
}

export function setOpenAiApiKey(key: string): void {
  localStorage.setItem(OPENAI_KEY, key)
}

export function getSupabaseUrl(): string {
  return localStorage.getItem(SUPABASE_URL_KEY) ?? import.meta.env.VITE_SUPABASE_URL ?? ''
}

export function setSupabaseUrl(url: string): void {
  localStorage.setItem(SUPABASE_URL_KEY, url)
}

export function getSupabaseAnonKey(): string {
  return localStorage.getItem(SUPABASE_ANON_KEY) ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
}

export function setSupabaseAnonKey(key: string): void {
  localStorage.setItem(SUPABASE_ANON_KEY, key)
}

export function getAiProvider(): AiProvider {
  const stored = localStorage.getItem(AI_PROVIDER_KEY) as AiProvider | null
  if (stored) return stored
  if (getGeminiApiKey()) return 'gemini'
  if (getOpenAiApiKey()) return 'openai'
  return 'rules'
}

export function setAiProvider(provider: AiProvider): void {
  localStorage.setItem(AI_PROVIDER_KEY, provider)
}

export function isSupabaseConfigured(): boolean {
  return !!(getSupabaseUrl() && getSupabaseAnonKey())
}
