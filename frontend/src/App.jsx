import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Lock, Unlock, Droplets, FileX, Scissors, ShieldCheck,
  ScanSearch, EyeOff, Minimize2, FolderArchive, Download, History,
  Upload, ChevronRight, AlertTriangle, CheckCircle2,
  RefreshCw, FileText, Zap, Shield, X, Copy, ExternalLink,
  LogIn, LogOut, UserCircle2, UserPlus, Users, LayoutDashboard, CreditCard
} from 'lucide-react'

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    id: 'encrypt', icon: Lock, label: 'Encrypt PDF',
    tag: null, color: 'text-amber-400',
    desc: 'AES-256 encryption with permission control'
  },
  {
    id: 'decrypt', icon: Unlock, label: 'Decrypt PDF',
    tag: null, color: 'text-amber-400',
    desc: 'Remove password from encrypted PDFs'
  },
  {
    id: 'watermark', icon: Droplets, label: 'Watermark',
    tag: null, color: 'text-cyan-400',
    desc: 'Tiled diagonal or positioned watermarks'
  },
  {
    id: 'metadata', icon: FileX, label: 'Remove Metadata',
    tag: null, color: 'text-cyan-400',
    desc: 'Strip author, dates, creator info'
  },
  {
    id: 'redact', icon: Scissors, label: 'Smart Redactor',
    tag: 'UNIQUE', color: 'text-green-400',
    desc: 'Auto-detect & permanently redact PII'
  },
  {
    id: 'permissions', icon: ShieldCheck, label: 'Permission Matrix',
    tag: 'UNIQUE', color: 'text-green-400',
    desc: 'Fine-grained print/copy/edit controls'
  },
  {
    id: 'scanner', icon: ScanSearch, label: 'Security Scanner',
    tag: 'UNIQUE', color: 'text-green-400',
    desc: 'Detect JS, malware, hidden threats'
  },
  {
    id: 'stego', icon: EyeOff, label: 'Steganography',
    tag: 'UNIQUE', color: 'text-purple-400',
    desc: 'Hide/reveal secret messages in PDFs'
  },
  {
    id: 'compress', icon: Minimize2, label: 'Compress PDF',
    tag: null, color: 'text-orange-400',
    desc: 'Reduce file size without quality loss'
  },
  {
    id: 'batch', icon: FolderArchive, label: 'Batch Process',
    tag: null, color: 'text-orange-400',
    desc: 'Process entire ZIP of PDFs at once'
  },
  {
    id: 'jobs', icon: History, label: 'My Jobs',
    tag: 'BETA', color: 'text-cyan-400',
    desc: 'Review your recent processing history'
  },
  {
    id: 'billing', icon: CreditCard, label: 'Billing',
    tag: 'NEW', color: 'text-amber-400',
    desc: 'Compare plans and start self-serve upgrades'
  },
  {
    id: 'admin', icon: LayoutDashboard, label: 'Admin Console',
    tag: 'ADMIN', color: 'text-green-400',
    desc: 'Manage users, plans, and platform activity'
  },
]

// ── Upload Zone ───────────────────────────────────────────────────────────────
function UploadZone({ onFile, file, accept = '.pdf', label = 'Drop PDF here' }) {
  const [dragging, setDragging] = useState(false)
  const ref = useRef()

  const handleDrop = useCallback(e => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [onFile])

  return (
    <div
      className={`upload-zone rounded-xl p-8 text-center cursor-pointer ${dragging ? 'drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => ref.current.click()}
    >
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      {file ? (
        <div className="flex items-center justify-center gap-3">
          <FileText size={20} className="text-amber-400" />
          <div className="text-left">
            <p className="font-display font-medium text-sm text-white">{file.name}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button className="ml-2 p-1 rounded hover:bg-white/5"
            onClick={e => { e.stopPropagation(); onFile(null) }}>
            <X size={14} className="text-gray-500" />
          </button>
        </div>
      ) : (
        <div>
          <Upload size={28} className="mx-auto mb-3 text-amber-400 opacity-60" />
          <p className="font-display font-medium text-sm text-white/80">{label}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            or click to browse
          </p>
        </div>
      )}
    </div>
  )
}

// ── Field components ──────────────────────────────────────────────────────────
function Field({ label, children, hint }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
      {hint && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{hint}</p>}
    </div>
  )
}

function Toggle({ label, checked, onChange, desc }) {
  return (
    <label className="toggle-wrap">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div>
        <span className="text-sm text-white/80">{label}</span>
        {desc && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</p>}
      </div>
    </label>
  )
}

// ── Download helper ───────────────────────────────────────────────────────────
async function downloadBlob(response, defaultName) {
  const blob = await response.blob()
  const cd = response.headers.get('Content-Disposition') || ''
  const match = cd.match(/filename=(.+)/)
  const name = match ? match[1] : defaultName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

async function getErrorMessage(response, fallback) {
  const contentType = response.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const data = await response.json()
      if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail
      if (typeof data?.message === 'string' && data.message.trim()) return data.message
    } else {
      const text = await response.text()
      if (text.trim()) return text.trim()
    }
  } catch {
    // Fall through to the default message when the response body is empty or malformed.
  }

  return fallback
}

const TOKEN_STORAGE_KEY = 'pdf_shield_token'
const USER_STORAGE_KEY = 'pdf_shield_user'

function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || ''
}

function getStoredUser() {
  const raw = localStorage.getItem(USER_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function storeSession(token, user) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
}

function clearSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(USER_STORAGE_KEY)
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getStoredToken()

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(url, {
    ...options,
    headers,
  })
}

async function downloadJobArtifact(jobId, filename) {
  const res = await apiFetch(`/api/jobs/${jobId}/download`)
  if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to download job output'))
  await downloadBlob(res, filename || `job_${jobId}_output`)
}

// ── Result Panel ──────────────────────────────────────────────────────────────
function ResultSuccess({ message, onReset }) {
  return (
    <div className="result-card flex items-start gap-4">
      <CheckCircle2 size={22} className="text-green-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-display font-semibold text-green-400">Done</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{message}</p>
      </div>
      <button className="btn-secondary text-xs px-3 py-2" onClick={onReset}>
        <RefreshCw size={12} /> New
      </button>
    </div>
  )
}

function ResultError({ message, onReset }) {
  return (
    <div style={{
      background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)',
      borderRadius: 12, padding: 20
    }} className="flex items-start gap-4 animate-[fadeIn_0.3s_ease]">
      <AlertTriangle size={20} className="text-red-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-display font-semibold text-red-400">Error</p>
        <p className="text-sm mt-1 text-red-300/70">{message}</p>
      </div>
      <button className="btn-secondary text-xs px-3 py-2" onClick={onReset}>
        <RefreshCw size={12} /> Retry
      </button>
    </div>
  )
}

// ── Tool Panels ───────────────────────────────────────────────────────────────

function EncryptPanel() {
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')
  const [allowPrint, setAllowPrint] = useState(true)
  const [allowCopy, setAllowCopy] = useState(false)
  const [allowAnnotations, setAllowAnnotations] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const reset = () => { setResult(null); setError(null); setFile(null); setPassword('') }

  const run = async () => {
    if (!file || !password) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('password', password)
      fd.append('allow_print', allowPrint)
      fd.append('allow_copy', allowCopy)
      fd.append('allow_annotations', allowAnnotations)
      const res = await apiFetch('/api/encrypt', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Encryption failed'))
      await downloadBlob(res, `encrypted_${file.name}`)
      setResult('Your PDF has been encrypted with AES-256 and downloaded.')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  if (result) return <ResultSuccess message={result} onReset={reset} />
  if (error) return <ResultError message={error} onReset={reset} />

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      <UploadZone file={file} onFile={setFile} />
      <Field label="Password">
        <input className="field font-mono" type="password" placeholder="Enter a strong password"
          value={password} onChange={e => setPassword(e.target.value)} />
      </Field>
      <div className="space-y-3 p-4 rounded-lg" style={{ background: 'var(--surface-2)' }}>
        <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Permissions</p>
        <Toggle label="Allow printing" checked={allowPrint} onChange={setAllowPrint} />
        <Toggle label="Allow text copying" checked={allowCopy} onChange={setAllowCopy} />
        <Toggle label="Allow annotations" checked={allowAnnotations} onChange={setAllowAnnotations} />
      </div>
      <button className="btn-primary w-full justify-center" onClick={run}
        disabled={!file || !password || loading}>
        {loading ? <><div className="spinner" /> Encrypting…</> : <><Lock size={16} /> Encrypt PDF</>}
      </button>
    </div>
  )
}

function DecryptPanel() {
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const reset = () => { setResult(null); setError(null); setFile(null); setPassword('') }

  const run = async () => {
    if (!file || !password) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('password', password)
      const res = await apiFetch('/api/decrypt', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Decryption failed'))
      await downloadBlob(res, `decrypted_${file.name}`)
      setResult('PDF decrypted and downloaded successfully.')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  if (result) return <ResultSuccess message={result} onReset={reset} />
  if (error) return <ResultError message={error} onReset={reset} />

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      <UploadZone file={file} onFile={setFile} />
      <Field label="Password">
        <input className="field font-mono" type="password" placeholder="Enter PDF password"
          value={password} onChange={e => setPassword(e.target.value)} />
      </Field>
      <button className="btn-primary w-full justify-center" onClick={run}
        disabled={!file || !password || loading}>
        {loading ? <><div className="spinner" /> Decrypting…</> : <><Unlock size={16} /> Decrypt PDF</>}
      </button>
    </div>
  )
}

function WatermarkPanel() {
  const [file, setFile] = useState(null)
  const [text, setText] = useState('CONFIDENTIAL')
  const [opacity, setOpacity] = useState(0.3)
  const [position, setPosition] = useState('diagonal')
  const [fontSize, setFontSize] = useState(48)
  const [color, setColor] = useState('red')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const reset = () => { setResult(null); setError(null); setFile(null) }

  const run = async () => {
    if (!file || !text) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('text', text)
      fd.append('opacity', opacity); fd.append('position', position)
      fd.append('font_size', fontSize); fd.append('color', color)
      const res = await apiFetch('/api/watermark', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Watermarking failed'))
      await downloadBlob(res, `watermarked_${file.name}`)
      setResult('Watermark applied and PDF downloaded.')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  if (result) return <ResultSuccess message={result} onReset={reset} />
  if (error) return <ResultError message={error} onReset={reset} />

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      <UploadZone file={file} onFile={setFile} />
      <Field label="Watermark text">
        <input className="field" value={text} onChange={e => setText(e.target.value)}
          placeholder="e.g. CONFIDENTIAL" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Position">
          <select className="field" value={position} onChange={e => setPosition(e.target.value)}>
            <option value="diagonal">Diagonal (tiled)</option>
            <option value="center">Center</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </Field>
        <Field label="Color">
          <select className="field" value={color} onChange={e => setColor(e.target.value)}>
            <option value="red">Red</option>
            <option value="gray">Gray</option>
            <option value="blue">Blue</option>
            <option value="black">Black</option>
          </select>
        </Field>
      </div>
      <Field label={`Opacity — ${Math.round(opacity * 100)}%`}>
        <input type="range" min={0.05} max={1} step={0.05} value={opacity}
          onChange={e => setOpacity(parseFloat(e.target.value))} />
      </Field>
      <Field label={`Font size — ${fontSize}px`}>
        <input type="range" min={12} max={120} step={4} value={fontSize}
          onChange={e => setFontSize(parseInt(e.target.value))} />
      </Field>
      <button className="btn-primary w-full justify-center" onClick={run}
        disabled={!file || !text || loading}>
        {loading ? <><div className="spinner" /> Applying…</> : <><Droplets size={16} /> Add Watermark</>}
      </button>
    </div>
  )
}

function MetadataPanel() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const reset = () => { setResult(null); setError(null); setFile(null) }

  const run = async () => {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await apiFetch('/api/remove-metadata', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to remove metadata'))
      await downloadBlob(res, `clean_${file.name}`)
      setResult('Metadata stripped — author, dates, creator, and XMP data removed.')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  if (result) return <ResultSuccess message={result} onReset={reset} />
  if (error) return <ResultError message={error} onReset={reset} />

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      <UploadZone file={file} onFile={setFile} />
      <div className="p-4 rounded-lg text-sm space-y-2" style={{ background: 'var(--surface-2)' }}>
        {['/Title', '/Author', '/Subject', '/Keywords', '/Creator', '/Producer', '/CreationDate', '/ModDate', 'XMP metadata'].map(f => (
          <div key={f} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <X size={10} className="text-red-400" /> {f}
          </div>
        ))}
      </div>
      <button className="btn-primary w-full justify-center" onClick={run} disabled={!file || loading}>
        {loading ? <><div className="spinner" /> Stripping…</> : <><FileX size={16} /> Remove Metadata</>}
      </button>
    </div>
  )
}

const REDACT_PATTERNS = [
  { id: 'email', label: 'Email addresses', ex: 'user@example.com' },
  { id: 'phone', label: 'Phone numbers', ex: '+1-555-0100' },
  { id: 'ssn', label: 'Social Security Numbers', ex: '123-45-6789' },
  { id: 'creditcard', label: 'Credit card numbers', ex: '4111 1111 1111 1111' },
  { id: 'ipaddress', label: 'IP addresses', ex: '192.168.1.1' },
  { id: 'url', label: 'URLs', ex: 'https://...' },
]

function RedactPanel() {
  const [file, setFile] = useState(null)
  const [selected, setSelected] = useState(['email', 'phone'])
  const [custom, setCustom] = useState('')
  const [fillColor, setFillColor] = useState('black')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const reset = () => { setResult(null); setError(null); setFile(null) }

  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const run = async () => {
    if (!file || (selected.length === 0 && !custom)) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('patterns', selected.join(','))
      fd.append('custom_pattern', custom)
      fd.append('redact_color', fillColor)
      const res = await apiFetch('/api/redact', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Redaction failed'))
      await downloadBlob(res, `redacted_${file.name}`)
      setResult('PII permanently redacted — the text cannot be recovered.')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  if (result) return <ResultSuccess message={result} onReset={reset} />
  if (error) return <ResultError message={error} onReset={reset} />

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      <UploadZone file={file} onFile={setFile} />
      <Field label="Patterns to redact">
        <div className="space-y-2">
          {REDACT_PATTERNS.map(p => (
            <label key={p.id} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer group"
              style={{ background: selected.includes(p.id) ? 'var(--amber-dim)' : 'var(--surface-2)', border: `1px solid ${selected.includes(p.id) ? 'rgba(245,158,11,0.3)' : 'var(--border)'}` }}>
              <input type="checkbox" checked={selected.includes(p.id)}
                onChange={() => toggle(p.id)} className="hidden" />
              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected.includes(p.id) ? 'bg-amber-400 border-amber-400' : 'border-gray-600'}`}>
                {selected.includes(p.id) && <CheckCircle2 size={10} className="text-black" />}
              </div>
              <div className="flex-1">
                <span className="text-sm text-white/80">{p.label}</span>
                <span className="ml-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{p.ex}</span>
              </div>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Custom regex pattern" hint="e.g. \bACME-\d{5}\b to redact internal IDs">
        <input className="field font-mono text-sm" placeholder="Custom regex…"
          value={custom} onChange={e => setCustom(e.target.value)} />
      </Field>
      <Field label="Redaction fill">
        <div className="flex gap-3">
          {['black', 'white'].map(c => (
            <button key={c} onClick={() => setFillColor(c)}
              className={`flex-1 py-2 rounded-lg text-sm border transition-all ${fillColor === c ? 'border-amber-400 text-amber-400' : 'border-gray-700 text-gray-500'}`}
              style={{ background: 'var(--surface-2)' }}>
              {c === 'black' ? '■ Black boxes' : '□ White boxes'}
            </button>
          ))}
        </div>
      </Field>
      <button className="btn-primary w-full justify-center" onClick={run}
        disabled={!file || (selected.length === 0 && !custom) || loading}>
        {loading ? <><div className="spinner" /> Redacting…</> : <><Scissors size={16} /> Redact Content</>}
      </button>
    </div>
  )
}

const PERMISSION_ROWS = [
  { key: 'allow_print', label: 'Print (low quality)', desc: 'Allow basic printing' },
  { key: 'allow_print_hq', label: 'Print (high quality)', desc: 'Allow high-res printing' },
  { key: 'allow_copy', label: 'Copy text', desc: 'Allow text selection & copy' },
  { key: 'allow_modify', label: 'Modify content', desc: 'Allow editing the PDF' },
  { key: 'allow_annotations', label: 'Add annotations', desc: 'Allow comments & marks' },
  { key: 'allow_forms', label: 'Fill forms', desc: 'Allow form field input' },
  { key: 'allow_assembly', label: 'Assemble pages', desc: 'Allow page extraction/insert' },
  { key: 'allow_accessibility', label: 'Accessibility', desc: 'Allow screen readers (recommended)' },
]

function PermissionsPanel() {
  const [file, setFile] = useState(null)
  const [ownerPw, setOwnerPw] = useState('')
  const [perms, setPerms] = useState({ allow_accessibility: true })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const reset = () => { setResult(null); setError(null); setFile(null) }

  const toggle = k => setPerms(p => ({ ...p, [k]: !p[k] }))

  const run = async () => {
    if (!file || !ownerPw) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('owner_password', ownerPw)
      PERMISSION_ROWS.forEach(r => fd.append(r.key, !!perms[r.key]))
      const res = await apiFetch('/api/permissions', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to update permissions'))
      await downloadBlob(res, `permissions_${file.name}`)
      setResult('Permission matrix applied. Anyone can open the file but your restrictions are enforced.')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  if (result) return <ResultSuccess message={result} onReset={reset} />
  if (error) return <ResultError message={error} onReset={reset} />

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      <UploadZone file={file} onFile={setFile} />
      <Field label="Owner password" hint="Used to change permissions later. Readers won't need this.">
        <input className="field font-mono" type="password" placeholder="Owner password"
          value={ownerPw} onChange={e => setOwnerPw(e.target.value)} />
      </Field>
      <Field label="What readers can do">
        <div className="space-y-2">
          {PERMISSION_ROWS.map(row => (
            <div key={row.key} className="flex items-center justify-between p-3 rounded-lg"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div>
                <p className="text-sm text-white/80">{row.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{row.desc}</p>
              </div>
              <input type="checkbox" checked={!!perms[row.key]}
                onChange={() => toggle(row.key)}
                className="w-5 h-5 accent-amber-400 cursor-pointer flex-shrink-0" />
            </div>
          ))}
        </div>
      </Field>
      <button className="btn-primary w-full justify-center" onClick={run}
        disabled={!file || !ownerPw || loading}>
        {loading ? <><div className="spinner" /> Applying…</> : <><ShieldCheck size={16} /> Apply Permissions</>}
      </button>
    </div>
  )
}

function ScannerPanel() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const reset = () => { setReport(null); setError(null); setFile(null) }

  const run = async () => {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await apiFetch('/api/scan', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Scan failed'))
      setReport(await res.json())
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const riskClass = r => ({ Low: 'risk-low', Medium: 'risk-medium', High: 'risk-high', Critical: 'risk-critical' }[r] || 'risk-low')

  if (error) return <ResultError message={error} onReset={reset} />

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      {!report ? (
        <>
          <UploadZone file={file} onFile={setFile} />
          <div className="p-4 rounded-lg text-xs space-y-1.5" style={{ background: 'var(--surface-2)' }}>
            {['JavaScript / ActionScript', 'Embedded file attachments', 'External links & phishing URLs', 'Form fields & interactivity', 'Encryption level', 'Author & creator metadata'].map(f => (
              <div key={f} className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                <ScanSearch size={10} className="text-cyan-400" /> {f}
              </div>
            ))}
          </div>
          <button className="btn-primary w-full justify-center" onClick={run} disabled={!file || loading}>
            {loading ? <><div className="spinner" /> Scanning…</> : <><ScanSearch size={16} /> Run Security Scan</>}
          </button>
        </>
      ) : (
        <div className="space-y-4 animate-[slideUp_0.4s_ease]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg">Scan Report</h3>
            <button className="btn-secondary text-xs px-3 py-1.5" onClick={reset}>
              <RefreshCw size={11} /> New scan
            </button>
          </div>

          {/* Risk badge + stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg text-center" style={{ background: 'var(--surface-2)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Risk level</p>
              <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${riskClass(report.risk_level)}`}>
                {report.risk_level}
              </span>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ background: 'var(--surface-2)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Pages</p>
              <p className="font-mono font-medium">{report.page_count}</p>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ background: 'var(--surface-2)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>File size</p>
              <p className="font-mono font-medium">{report.file_size_kb} KB</p>
            </div>
          </div>

          {report.summary && (
            <div className="p-4 rounded-lg text-sm leading-6" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Executive summary</p>
              <p style={{ color: 'var(--text)' }}>{report.summary}</p>
            </div>
          )}

          {/* Indicators */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Encrypted', val: report.encrypted },
              { label: 'JavaScript', val: report.has_javascript, warn: true },
              { label: 'Embedded files', val: report.embedded_files.length > 0, warn: true },
              { label: 'External links', val: report.external_links.length > 0 },
              { label: 'Form fields', val: report.form_fields.length > 0 },
              { label: 'Signatures', val: report.has_digital_signatures },
            ].map(({ label, val, warn }) => (
              <div key={label} className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: 'var(--surface-2)' }}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className={`text-xs font-mono font-medium ${val ? (warn ? 'text-red-400' : 'text-green-400') : 'text-gray-600'}`}>
                  {val ? 'YES' : 'NO'}
                </span>
              </div>
            ))}
          </div>

          {report.counts && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Counts</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Pages', report.counts.pages],
                  ['Metadata fields', report.counts.metadata_fields],
                  ['External links', report.counts.external_links],
                  ['Embedded files', report.counts.embedded_files],
                  ['Form fields', report.counts.form_fields],
                  ['JavaScript blocks', report.javascript_count],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ background: 'var(--surface-2)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span className="text-xs font-mono font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Findings */}
          {report.findings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Findings</p>
              {report.findings.map((f, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={12} className={`severity-${f.severity}`} />
                    <span className={`text-xs font-medium severity-${f.severity}`}>{f.type}</span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.detail}</p>
                </div>
              ))}
            </div>
          )}

          {report.document_properties && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Document properties</p>
              {Object.entries(report.document_properties)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-xs p-2 rounded" style={{ background: 'var(--surface-2)' }}>
                    <span className="font-mono text-cyan-400 flex-shrink-0">{k}</span>
                    <span style={{ color: 'var(--text-muted)' }} className="truncate">{v}</span>
                  </div>
                ))}
              {Object.values(report.document_properties).every(v => !v) && (
                <div className="text-xs p-2 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  No standard document properties were found.
                </div>
              )}
            </div>
          )}

          {/* External links */}
          {report.external_links.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>External URLs ({report.external_links.length})</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {report.external_links.slice(0, 20).map((u, i) => (
                  <p key={i} className="text-xs font-mono truncate p-2 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>{u}</p>
                ))}
              </div>
            </div>
          )}

          {report.suspicious_text_hits?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Suspicious markers</p>
              <div className="flex flex-wrap gap-2">
                {report.suspicious_text_hits.map(hit => (
                  <span key={hit} className="text-xs font-mono px-2 py-1 rounded"
                    style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}>
                    {hit}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          {Object.keys(report.metadata).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Document metadata</p>
              {Object.entries(report.metadata).map(([k, v]) => (
                <div key={k} className="flex gap-3 text-xs p-2 rounded" style={{ background: 'var(--surface-2)' }}>
                  <span className="font-mono text-amber-400 flex-shrink-0">{k}</span>
                  <span style={{ color: 'var(--text-muted)' }} className="truncate">{v}</span>
                </div>
              ))}
            </div>
          )}

          {report.recommendations?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Recommendations</p>
              <div className="space-y-2">
                {report.recommendations.map((item, i) => (
                  <div key={i} className="p-3 rounded-lg text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StegoPanel() {
  const [mode, setMode] = useState('hide')
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [revealed, setRevealed] = useState(null)
  const [error, setError] = useState(null)
  const reset = () => { setResult(null); setError(null); setFile(null); setRevealed(null); setMessage('') }

  const run = async () => {
    if (!file || !key) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('key', key)
      if (mode === 'hide') {
        if (!message) { setLoading(false); return }
        fd.append('message', message)
        const res = await apiFetch('/api/stego/hide', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to hide message'))
        await downloadBlob(res, `stego_${file.name}`)
        setResult('Message hidden inside the PDF. Only someone with the correct key can reveal it.')
      } else {
        const res = await apiFetch('/api/stego/reveal', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to reveal hidden message'))
        const data = await res.json()
        setRevealed(data.message || null)
        if (!data.message) setError('No hidden message found, or wrong key.')
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  if (result) return <ResultSuccess message={result} onReset={reset} />

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {['hide', 'reveal'].map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 py-2.5 text-sm font-medium transition-all capitalize ${mode === m ? 'text-black bg-amber-400' : 'text-gray-500'}`}
            style={{ background: mode === m ? undefined : 'var(--surface-2)' }}>
            {m === 'hide' ? '🔒 Hide message' : '🔓 Reveal message'}
          </button>
        ))}
      </div>

      <UploadZone file={file} onFile={setFile} label={mode === 'hide' ? 'Drop PDF to embed message into' : 'Drop PDF to reveal message from'} />

      {mode === 'hide' && (
        <Field label="Secret message">
          <textarea className="field" rows={4} placeholder="Your secret message…"
            value={message} onChange={e => setMessage(e.target.value)} />
        </Field>
      )}

      <Field label="Secret key" hint="Both parties need this key to hide/reveal.">
        <input className="field font-mono" type="password" placeholder="Shared secret key"
          value={key} onChange={e => setKey(e.target.value)} />
      </Field>

      {error && <div className="text-xs text-red-400 p-3 rounded-lg" style={{ background: 'rgba(248,113,113,0.08)' }}>{error}</div>}

      {revealed && (
        <div className="p-4 rounded-lg" style={{ background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <p className="text-xs font-medium uppercase tracking-widest text-amber-400 mb-2">Hidden message revealed</p>
          <p className="text-sm font-mono text-white/90 whitespace-pre-wrap break-words">{revealed}</p>
          <button className="mt-3 btn-secondary text-xs px-3 py-1.5"
            onClick={() => navigator.clipboard.writeText(revealed)}>
            <Copy size={11} /> Copy
          </button>
        </div>
      )}

      <button className="btn-primary w-full justify-center" onClick={run}
        disabled={!file || !key || (mode === 'hide' && !message) || loading}>
        {loading ? <><div className="spinner" /> Processing…</> :
          mode === 'hide' ? <><EyeOff size={16} /> Hide Message</> : <><Zap size={16} /> Reveal Message</>}
      </button>
    </div>
  )
}

function CompressPanel() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const reset = () => { setStats(null); setError(null); setFile(null) }

  const run = async () => {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('quality', 75)
      const res = await apiFetch('/api/compress', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Compression failed'))
      const orig = parseInt(res.headers.get('X-Original-Size') || '0')
      const comp = parseInt(res.headers.get('X-Compressed-Size') || '0')
      const pct = parseFloat(res.headers.get('X-Reduction-Pct') || '0')
      await downloadBlob(res, `compressed_${file.name}`)
      setStats({ orig, comp, pct })
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  if (error) return <ResultError message={error} onReset={reset} />

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      <UploadZone file={file} onFile={setFile} />
      <Field label="Compression mode" hint="Uses lossless structural compression. Image quality tuning is not available yet.">
        <div className="field">Balanced lossless compression</div>
      </Field>
      {stats && (
        <div className="result-card">
          <p className="text-xs font-medium uppercase tracking-widest text-green-400 mb-3">Compression complete</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Original</p>
              <p className="font-mono font-medium">{(stats.orig / 1024).toFixed(1)} KB</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Compressed</p>
              <p className="font-mono font-medium text-green-400">{(stats.comp / 1024).toFixed(1)} KB</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Saved</p>
              <p className="font-mono font-medium text-amber-400">{stats.pct}%</p>
            </div>
          </div>
          <button className="btn-secondary text-xs px-3 py-1.5 mt-3 w-full justify-center" onClick={reset}>
            <RefreshCw size={11} /> Compress another
          </button>
        </div>
      )}
      {!stats && (
        <button className="btn-primary w-full justify-center" onClick={run} disabled={!file || loading}>
          {loading ? <><div className="spinner" /> Compressing…</> : <><Minimize2 size={16} /> Compress PDF</>}
        </button>
      )}
    </div>
  )
}

function BatchPanel({ session, onJobsChanged, onNavigate }) {
  const [file, setFile] = useState(null)
  const [operation, setOperation] = useState('remove_metadata')
  const [password, setPassword] = useState('')
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const reset = () => { setResult(null); setError(null); setFile(null) }

  const needsPassword = ['encrypt', 'decrypt'].includes(operation)
  const needsWatermark = operation === 'watermark'

  const run = async () => {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('operation', operation)
      fd.append('password', password)
      fd.append('watermark_text', watermarkText)
      const res = await apiFetch(session?.token ? '/api/batch/async' : '/api/batch', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await getErrorMessage(res, session?.token ? 'Batch submission failed' : 'Batch failed'))
      if (session?.token) {
        const job = await res.json()
        onJobsChanged?.()
        onNavigate?.('jobs')
        setResult(`Batch job #${job.id} queued. Track progress and download the result from My Jobs.`)
      } else {
        await downloadBlob(res, 'processed_batch.zip')
        setResult('Batch complete and downloaded as a ZIP.')
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  if (result) return <ResultSuccess message={result} onReset={reset} />
  if (error) return <ResultError message={error} onReset={reset} />

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      <UploadZone file={file} onFile={setFile} accept=".zip" label="Drop ZIP of PDFs here" />
      <Field label="Operation to apply">
        <select className="field" value={operation} onChange={e => setOperation(e.target.value)}>
          <option value="remove_metadata">Remove metadata</option>
          <option value="encrypt">Encrypt all</option>
          <option value="decrypt">Decrypt all</option>
          <option value="watermark">Watermark all</option>
          <option value="compress">Compress all</option>
        </select>
      </Field>
      {needsPassword && (
        <Field label="Password">
          <input className="field font-mono" type="password" placeholder="Password for all files"
            value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
      )}
      {needsWatermark && (
        <Field label="Watermark text">
          <input className="field" value={watermarkText} onChange={e => setWatermarkText(e.target.value)} />
        </Field>
      )}
      <div className="text-xs rounded-lg p-3" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
        {session?.token
          ? 'Signed in: batch jobs run asynchronously and can be downloaded later from My Jobs.'
          : 'Guest mode: batch processing runs immediately and downloads the ZIP in the browser.'}
      </div>
      <button className="btn-primary w-full justify-center" onClick={run}
        disabled={!file || (needsPassword && !password) || loading}>
        {loading ? <><div className="spinner" /> Processing batch…</> : <><FolderArchive size={16} /> Process Batch</>}
      </button>
    </div>
  )
}

function JobsPanel({ session, jobsRefreshKey }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)

  const loadJobs = async () => {
    if (!session?.token) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/jobs')
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to load jobs'))
      setJobs(await res.json())
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadJobs()
  }, [session?.token, jobsRefreshKey])

  useEffect(() => {
    if (!session?.token) return
    if (!jobs.some(job => job.status === 'processing')) return

    const id = setInterval(loadJobs, 3000)
    return () => clearInterval(id)
  }, [session?.token, jobs])

  const handleDownload = async job => {
    setDownloadingId(job.id)
    setError(null)
    try {
      await downloadJobArtifact(job.id, job.output_filename)
    } catch (e) {
      setError(e.message)
    }
    setDownloadingId(null)
  }

  if (!session?.token) {
    return (
      <div className="space-y-4 animate-[slideUp_0.4s_ease]">
        <div className="result-card">
          <p className="font-display font-semibold text-white">Sign in to view job history</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Your recent scans and PDF processing history will appear here after you create an account or log in.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-[slideUp_0.4s_ease]">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-lg">Recent Jobs</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Activity for {session.user?.email || 'your account'}
          </p>
        </div>
        <button className="btn-secondary text-xs px-3 py-2" onClick={loadJobs} disabled={loading}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && <ResultError message={error} onReset={loadJobs} />}

      {!error && loading && (
        <div className="result-card flex items-center gap-3">
          <div className="spinner" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading job history...</p>
        </div>
      )}

      {!error && !loading && jobs.length === 0 && (
        <div className="result-card">
          <p className="font-display font-semibold text-white">No jobs yet</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Run any tool while signed in and the result will be recorded here automatically.
          </p>
        </div>
      )}

      {!error && !loading && jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map(job => (
            <div
              key={job.id}
              className="p-4 rounded-xl"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display font-semibold text-white capitalize">{job.operation.replace(/_/g, ' ')}</p>
                  <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>
                    {job.original_filename}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded font-mono ${
                    job.status === 'completed'
                      ? 'risk-low'
                      : job.status === 'failed'
                        ? 'risk-high'
                        : 'risk-medium'
                  }`}
                >
                  {job.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                <div className="p-2 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                  Created: <span className="font-mono text-white">{new Date(job.created_at).toLocaleString()}</span>
                </div>
                <div className="p-2 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                  Size: <span className="font-mono text-white">{(job.file_size_bytes / 1024).toFixed(1)} KB</span>
                </div>
              </div>

              {job.output_filename && (
                <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                  Output file: <span className="font-mono text-white">{job.output_filename}</span>
                </p>
              )}

              {job.error_message && (
                <p className="text-xs mt-3 text-red-300/80">
                  Error: {job.error_message}
                </p>
              )}

              <div className="flex gap-2 mt-4">
                <button className="btn-secondary text-xs px-3 py-2" onClick={loadJobs}>
                  <RefreshCw size={11} /> Refresh status
                </button>
                {job.status === 'completed' && job.output_filename && (
                  <button
                    className="btn-primary text-xs px-3 py-2"
                    onClick={() => handleDownload(job)}
                    disabled={downloadingId === job.id}
                  >
                    {downloadingId === job.id ? <><div className="spinner" /> Downloading...</> : <><Download size={12} /> Download</>}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AuthPanel({ mode, onModeChange, onAuthenticated }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!email || !password || (mode === 'register' && !fullName.trim())) return
    setLoading(true)
    setError(null)

    try {
      const payload = {
        email,
        password,
        ...(mode === 'register' ? { full_name: fullName.trim() } : {}),
      }
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login'
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await getErrorMessage(res, `${mode === 'register' ? 'Registration' : 'Login'} failed`))
      const data = await res.json()
      storeSession(data.access_token, data.user)
      onAuthenticated({ token: data.access_token, user: data.user })
    } catch (e) {
      setError(e.message)
    }

    setLoading(false)
  }

  return (
    <div className="mb-6 p-5 rounded-xl animate-[slideUp_0.4s_ease]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-display font-bold text-lg">{mode === 'register' ? 'Create account' : 'Sign in'}</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {mode === 'register'
              ? 'Create an account to save jobs and use the app like a real SaaS workspace.'
              : 'Sign in to attach processing history to your account.'}
          </p>
        </div>
        <button className="btn-secondary text-xs px-3 py-2" onClick={() => onModeChange(null)}>
          <X size={12} /> Close
        </button>
      </div>

      <div className="space-y-4">
        {mode === 'register' && (
          <Field label="Full name">
            <input className="field" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" />
          </Field>
        )}
        <Field label="Email">
          <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password">
          <input className="field font-mono" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </Field>

        {error && <div className="text-xs text-red-300/80">{error}</div>}

        <div className="flex gap-3">
          <button
            className="btn-primary"
            onClick={submit}
            disabled={!email || !password || (mode === 'register' && !fullName.trim()) || loading}
          >
            {loading ? <><div className="spinner" /> Working...</> : mode === 'register' ? <><UserPlus size={14} /> Create account</> : <><LogIn size={14} /> Sign in</>}
          </button>
          <button className="btn-secondary" onClick={() => onModeChange(mode === 'register' ? 'login' : 'register')}>
            {mode === 'register' ? 'Have an account? Sign in' : 'Need an account? Register'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BillingPanel({ session, onSessionRefresh }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [checkoutPlan, setCheckoutPlan] = useState('')
  const [banner, setBanner] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('billing') === 'success') return 'Billing checkout completed. Your plan will update after Razorpay confirms the subscription.'
    if (params.get('billing') === 'cancelled') return 'Billing checkout was cancelled. Your current plan is unchanged.'
    return ''
  })

  const loadPlans = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/billing/plans')
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to load billing plans'))
      setPlans(await res.json())
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadPlans()
  }, [session?.token])

  useEffect(() => {
    if (!session?.token) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('billing') !== 'success') return

    const id = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/auth/me')
        if (!res.ok) return
        const user = await res.json()
        storeSession(session.token, user)
        onSessionRefresh?.(user)
      } catch {
        // Ignore refresh failures and leave the last known session intact.
      }
    }, 1200)

    return () => clearTimeout(id)
  }, [session?.token])

  const startCheckout = async planId => {
    setCheckoutPlan(planId)
    setError(null)
    try {
      const res = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      })
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to start checkout'))
      const data = await res.json()
      window.location.href = data.checkout_url
    } catch (e) {
      setError(e.message)
      setCheckoutPlan('')
    }
  }

  const currentPlan = plans.find(plan => plan.is_current) || null

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-lg">Billing</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Review your plan, compare limits, and launch Razorpay checkout when billing is configured.
          </p>
        </div>
        <button className="btn-secondary text-xs px-3 py-2" onClick={loadPlans} disabled={loading}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {banner && (
        <div className="result-card">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{banner}</p>
        </div>
      )}

      {error && <ResultError message={error} onReset={loadPlans} />}

      {!session?.token && (
        <div className="result-card">
          <p className="font-display font-semibold text-white">Sign in to upgrade your plan</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Guest users can browse plans, but checkout requires an authenticated account so upgrades can be attached to the right user.
          </p>
        </div>
      )}

      {currentPlan && (
        <div className="p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Current plan</p>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-display font-semibold text-white capitalize">{currentPlan.name}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{currentPlan.description}</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded font-mono risk-low">ACTIVE</span>
          </div>
          {session?.token && currentPlan.name !== 'free' && (
            <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
              Subscription management will be handled from the Razorpay merchant dashboard until a self-serve customer portal is added.
            </p>
          )}
        </div>
      )}

      {loading && plans.length === 0 && (
        <div className="result-card flex items-center gap-3">
          <div className="spinner" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading billing plans...</p>
        </div>
      )}

      <div className="space-y-3">
        {plans.map(plan => (
          <div
            key={plan.id}
            className="p-4 rounded-xl"
            style={{ background: 'var(--surface-2)', border: `1px solid ${plan.is_current ? 'rgba(74,222,128,0.35)' : 'var(--border)'}` }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display font-semibold text-white capitalize">{plan.name}</p>
                  {plan.is_current && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded font-mono risk-low">CURRENT</span>
                  )}
                </div>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{plan.description}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-white">{plan.price_label}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {plan.checkout_enabled ? 'Razorpay checkout ready' : 'Checkout not configured'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
              <div className="p-2 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                Daily jobs: <span className="font-mono text-white">{plan.daily_jobs_limit}</span>
              </div>
              <div className="p-2 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                Batch PDFs: <span className="font-mono text-white">{plan.batch_pdf_limit}</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {plan.features.map(feature => (
                <span
                  key={feature}
                  className="text-[10px] font-mono px-2 py-1 rounded"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                >
                  {feature}
                </span>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              {plan.is_current ? (
                <button className="btn-secondary text-xs px-3 py-2" disabled>
                  <CheckCircle2 size={12} /> Current plan
                </button>
              ) : !session?.token ? (
                <button className="btn-secondary text-xs px-3 py-2" onClick={() => setBanner('Sign in first to launch Razorpay checkout for paid plans.')}>
                  <LogIn size={12} /> Sign in to upgrade
                </button>
              ) : (
                <button
                  className="btn-primary text-xs px-3 py-2"
                  onClick={() => startCheckout(plan.id)}
                  disabled={!plan.checkout_enabled || checkoutPlan === plan.id}
                >
                  {checkoutPlan === plan.id
                    ? <><div className="spinner" /> Starting checkout...</>
                    : <><CreditCard size={12} /> {plan.checkout_enabled ? `Upgrade to ${plan.name}` : 'Razorpay setup required'}</>}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminPanel({ session }) {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [savingUserId, setSavingUserId] = useState(null)

  const loadAdminData = async () => {
    if (!session?.token) return
    setLoading(true)
    setError(null)
    try {
      const [statsRes, usersRes, jobsRes] = await Promise.all([
        apiFetch('/api/admin/stats'),
        apiFetch('/api/admin/users?limit=50'),
        apiFetch('/api/admin/jobs?limit=20'),
      ])

      if (!statsRes.ok) throw new Error(await getErrorMessage(statsRes, 'Failed to load admin stats'))
      if (!usersRes.ok) throw new Error(await getErrorMessage(usersRes, 'Failed to load users'))
      if (!jobsRes.ok) throw new Error(await getErrorMessage(jobsRes, 'Failed to load jobs'))

      setStats(await statsRes.json())
      setUsers(await usersRes.json())
      setJobs(await jobsRes.json())
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAdminData()
  }, [session?.token])

  const updatePlan = async (userId, plan) => {
    setSavingUserId(userId)
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to update plan'))
      const updated = await res.json()
      setUsers(current => current.map(user => user.id === userId ? updated : user))
    } catch (e) {
      setError(e.message)
    }
    setSavingUserId(null)
  }

  if (!session?.token) {
    return (
      <div className="result-card">
        <p className="font-display font-semibold text-white">Sign in as an admin to access the console</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-[slideUp_0.4s_ease]">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-lg">Admin Console</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Platform oversight for users, plans, and recent jobs.
          </p>
        </div>
        <button className="btn-secondary text-xs px-3 py-2" onClick={loadAdminData} disabled={loading}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && <ResultError message={error} onReset={loadAdminData} />}

      {loading && !stats && (
        <div className="result-card flex items-center gap-3">
          <div className="spinner" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading admin data...</p>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Total users', stats.total_users],
            ['Active users', stats.active_users],
            ['Total jobs', stats.total_jobs],
            ['Failed jobs', stats.failed_jobs],
            ['Processing jobs', stats.processing_jobs],
          ].map(([label, value]) => (
            <div key={label} className="p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
              <p className="font-mono font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Users</p>
        <div className="space-y-3">
          {users.map(user => (
            <div key={user.id} className="p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-display font-semibold text-white">{user.full_name || 'Unnamed user'}</p>
                  <p className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="field text-xs"
                    value={user.plan}
                    onChange={e => updatePlan(user.id, e.target.value)}
                    disabled={savingUserId === user.id}
                    style={{ width: 110 }}
                  >
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                    <option value="business">business</option>
                  </select>
                </div>
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                Status: <span className="font-mono text-white">{user.is_active ? 'active' : 'inactive'}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Recent Jobs</p>
        <div className="space-y-3">
          {jobs.map(job => (
            <div key={job.id} className="p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display font-semibold text-white capitalize">{job.operation.replace(/_/g, ' ')}</p>
                  <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-muted)' }}>{job.original_filename}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded font-mono ${
                  job.status === 'completed' ? 'risk-low' : job.status === 'failed' ? 'risk-high' : 'risk-medium'
                }`}>
                  {job.status}
                </span>
              </div>
              {job.error_message && (
                <p className="text-xs mt-3 text-red-300/80">Error: {job.error_message}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const PANELS = {
  encrypt: EncryptPanel,
  decrypt: DecryptPanel,
  watermark: WatermarkPanel,
  metadata: MetadataPanel,
  redact: RedactPanel,
  permissions: PermissionsPanel,
  scanner: ScannerPanel,
  stego: StegoPanel,
  compress: CompressPanel,
  batch: BatchPanel,
  jobs: JobsPanel,
  billing: BillingPanel,
  admin: AdminPanel,
}

// ── App Shell ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTool, setActiveTool] = useState('encrypt')
  const [apiOnline, setApiOnline] = useState(null)
  const [session, setSession] = useState(() => ({
    token: getStoredToken(),
    user: getStoredUser(),
  }))
  const [authMode, setAuthMode] = useState(null)
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const tool = TOOLS.find(t => t.id === activeTool)
  const Panel = PANELS[activeTool]

  useEffect(() => {
    let cancelled = false

    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health')
        if (!cancelled) setApiOnline(res.ok)
      } catch {
        if (!cancelled) setApiOnline(false)
      }
    }

    checkHealth()
    const id = setInterval(checkHealth, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (!session.token) return

    let cancelled = false

    const loadCurrentUser = async () => {
      try {
        const res = await apiFetch('/api/auth/me')
        if (!res.ok) throw new Error('Session expired')
        const user = await res.json()
        if (!cancelled) {
          storeSession(session.token, user)
          setSession(current => ({ ...current, user }))
        }
      } catch {
        clearSession()
        if (!cancelled) {
          setSession({ token: '', user: null })
        }
      }
    }

    if (!session.user) {
      loadCurrentUser()
    }

    return () => {
      cancelled = true
    }
  }, [session.token])

  useEffect(() => {
    if (!session.token) {
      setIsAdmin(false)
      return
    }

    let cancelled = false

    const checkAdmin = async () => {
      try {
        const res = await apiFetch('/api/admin/stats')
        if (!cancelled) setIsAdmin(res.ok)
      } catch {
        if (!cancelled) setIsAdmin(false)
      }
    }

    checkAdmin()

    return () => {
      cancelled = true
    }
  }, [session.token])

  const handleAuthenticated = nextSession => {
    setSession(nextSession)
    setAuthMode(null)
    setJobsRefreshKey(key => key + 1)
    setActiveTool('jobs')
  }

  const handleLogout = () => {
    clearSession()
    setSession({ token: '', user: null })
    setIsAdmin(false)
    setAuthMode(null)
    setActiveTool('encrypt')
  }

  const visibleTools = TOOLS.filter(t => t.id !== 'admin' || isAdmin)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Scan line decoration */}
      <div className="scan-line" />

      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>

        {/* Logo */}
        <div className="p-5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500">
            <Shield size={16} className="text-black" />
          </div>
          <div>
            <p className="font-display font-bold text-sm tracking-tight">PDF Shield</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Secure document platform</p>
          </div>
        </div>

        {/* Tool list */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleTools.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setActiveTool(t.id)}
                className={`tool-card w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg ${activeTool === t.id ? 'active' : ''}`}
              >
                <Icon size={15} className={t.color} />
                <span className="text-sm flex-1 truncate" style={{ color: activeTool === t.id ? 'var(--text)' : 'rgba(255,255,255,0.65)' }}>
                  {t.label}
                </span>
                {t.tag && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono"
                    style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}>
                    {t.tag}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <p className="font-mono">v1.0.0</p>
          <p className="mt-0.5">{session.user ? `Signed in as ${session.user.email}` : 'Guest mode available'}</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="px-8 py-5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <tool.icon size={16} className={tool.color} />
              <h1 className="font-display font-bold text-lg">{tool.label}</h1>
              {tool.tag && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono"
                  style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}>
                  {tool.tag}
                </span>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{tool.desc}</p>
          </div>
          <div className="flex items-center gap-3">
            {session.user ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <UserCircle2 size={14} className="text-cyan-400" />
                <div className="text-xs">
                  <p className="font-mono text-white">{session.user.full_name || session.user.email}</p>
                  <p style={{ color: 'var(--text-muted)' }}>{session.user.plan} plan</p>
                </div>
                <button className="btn-secondary text-xs px-3 py-2" onClick={() => setActiveTool('jobs')}>
                  <History size={12} /> Jobs
                </button>
                {isAdmin && (
                  <button className="btn-secondary text-xs px-3 py-2" onClick={() => setActiveTool('admin')}>
                    <Users size={12} /> Admin
                  </button>
                )}
                <button className="btn-secondary text-xs px-3 py-2" onClick={handleLogout}>
                  <LogOut size={12} /> Log out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button className="btn-secondary text-xs px-3 py-2" onClick={() => setAuthMode('login')}>
                  <LogIn size={12} /> Sign in
                </button>
                <button className="btn-primary text-xs px-3 py-2" onClick={() => setAuthMode('register')}>
                  <UserPlus size={12} /> Create account
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs font-mono"
              style={{ color: 'var(--text-muted)' }}>
              <div className={`w-1.5 h-1.5 rounded-full ${apiOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              {apiOnline === null ? 'Checking API' : apiOnline ? 'API online' : 'API offline'}
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-8 py-8">
            {authMode && <AuthPanel mode={authMode} onModeChange={setAuthMode} onAuthenticated={handleAuthenticated} />}
            {Panel && (
              <Panel
                key={`${activeTool}-${jobsRefreshKey}`}
                session={session}
                jobsRefreshKey={jobsRefreshKey}
                onJobsChanged={() => setJobsRefreshKey(key => key + 1)}
                onNavigate={setActiveTool}
                onSessionRefresh={user => setSession(current => ({ ...current, user }))}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}


