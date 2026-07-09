import { useEffect, useState } from 'react'
import { getHandStorageDiagnostic } from '../lib/handLogService'

export function HandStorageDiagnostic() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof getHandStorageDiagnostic>> | null>(null)

  useEffect(() => {
    getHandStorageDiagnostic().then(setInfo)
  }, [])

  if (!info) return null

  return (
    <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
      <p className="text-gold font-semibold uppercase tracking-wider mb-2">Hand history</p>
      {info.supabaseConfigured ? (
        <>
          <p className="text-white/70"><span className="text-emerald-400 font-bold">{info.cloudCount}</span> hands in Supabase cloud</p>
          <p className="text-white/50 mt-1">{info.localCount} cached locally · {info.cloudCountThisDevice} from this browser ID</p>
          {info.cloudCount > info.cloudCountThisDevice && (
            <p className="text-amber-300/90 mt-1">All cloud hands load automatically (including other browsers/devices).</p>
          )}
        </>
      ) : (
        <p className="text-white/60">{info.localCount} hands saved locally only — add Supabase below to sync.</p>
      )}
      <p className="text-white/30 mt-2 truncate" title={info.deviceId}>Device ID: {info.deviceId.slice(0, 8)}…</p>
    </div>
  )
}
