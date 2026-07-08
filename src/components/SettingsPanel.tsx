import { useState } from 'react'
import {
  getAiProvider,
  getGeminiApiKey,
  getOpenAiApiKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
  setAiProvider,
  setGeminiApiKey,
  setOpenAiApiKey,
  setSupabaseAnonKey,
  setSupabaseUrl,
  type AiProvider,
} from '../lib/config'
import { resetSupabaseClient } from '../lib/supabase'
import { testGeminiConnection } from '../lib/geminiService'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [geminiKey, setGeminiKey] = useState(getGeminiApiKey())
  const [openaiKey, setOpenaiKey] = useState(getOpenAiApiKey())
  const [supabaseUrl, setSbUrl] = useState(getSupabaseUrl())
  const [supabaseAnon, setSbAnon] = useState(getSupabaseAnonKey())
  const [provider, setProvider] = useState<AiProvider>(getAiProvider())
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const handleSave = () => {
    setGeminiApiKey(geminiKey.trim())
    setOpenAiApiKey(openaiKey.trim())
    setSupabaseUrl(supabaseUrl.trim())
    setSupabaseAnonKey(supabaseAnon.trim())
    setAiProvider(provider)
    resetSupabaseClient()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestGemini = async () => {
    setTesting(true)
    setGeminiApiKey(geminiKey.trim())
    const result = await testGeminiConnection()
    setTestResult(result.message)
    setTesting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-slate-900 rounded-2xl border border-white/10 shadow-2xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold">⚙️ Settings</h2>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="mb-4">
          <label className="text-sm font-medium block mb-1">AI coach</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value as AiProvider)}
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm"
          >
            <option value="gemini">Google Gemini (recommended, free tier)</option>
            <option value="openai">OpenAI GPT</option>
            <option value="rules">Built-in rules only</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="text-sm font-medium block mb-1">Gemini API key</label>
          <p className="text-xs text-white/50 mb-2">Free at aistudio.google.com/apikey</p>
          <input
            type="password"
            value={geminiKey}
            onChange={e => setGeminiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm mb-2"
          />
          <button
            type="button"
            onClick={handleTestGemini}
            disabled={testing}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50"
          >
            {testing ? 'Testing…' : 'Test Gemini'}
          </button>
          {testResult && <p className="text-xs mt-2 text-white/60">{testResult}</p>}
        </div>

        <div className="mb-4">
          <label className="text-sm font-medium block mb-1">OpenAI API key (optional)</label>
          <input
            type="password"
            value={openaiKey}
            onChange={e => setOpenaiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm"
          />
        </div>

        <hr className="border-white/10 my-4" />

        <p className="text-xs uppercase tracking-wider text-gold mb-3">Supabase (hand history cloud sync)</p>
        <p className="text-xs text-white/50 mb-3">Use the same Supabase project as your other apps. Run the SQL migration in supabase/migrations/</p>

        <div className="mb-3">
          <label className="text-xs text-white/50 block mb-1">Project URL</label>
          <input
            type="text"
            value={supabaseUrl}
            onChange={e => setSbUrl(e.target.value)}
            placeholder="https://xxx.supabase.co"
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm"
          />
        </div>
        <div className="mb-4">
          <label className="text-xs text-white/50 block mb-1">Anon public key</label>
          <input
            type="password"
            value={supabaseAnon}
            onChange={e => setSbAnon(e.target.value)}
            placeholder="eyJ..."
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="w-full py-3 rounded-xl bg-gold text-slate-900 font-bold hover:bg-gold-dark transition-colors"
        >
          {saved ? 'Saved!' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}
