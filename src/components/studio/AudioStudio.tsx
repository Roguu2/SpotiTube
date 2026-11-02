import { useState, type FormEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Link2, Repeat, RotateCcw, Save, Trash, X } from 'lucide-react'
import {
  BUILT_IN_EQ_PRESETS,
  DSP_PRESETS,
  EQ_FREQUENCIES,
  EQ_GAIN_LIMIT_DB,
  PITCH_LIMIT_SEMITONES,
  REVERB_DECAY_MAX,
  REVERB_DECAY_MIN,
  SPEED_MAX,
  SPEED_MIN,
  activeDspPreset,
  effectivePitch,
  type DspPresetId
} from '@core/dsp'
import { Slider } from '@/components/ui/Slider'
import { Button, IconButton } from '@/components/ui/IconButton'
import { Spectrum } from './Spectrum'
import { StreamSourcePicker } from './StreamSourcePicker'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { toast } from '@/store/useToastStore'
import { cx, formatHz, formatSigned, formatTime } from '@/lib/format'

export function AudioStudio() {
  const close = useSettingsStore((s) => s.toggleStudio)
  const hydrated = useAudioEngineStore((s) => s.hydrated)
  const embedMode = useEmbedMode()

  return (
    <motion.aside
      aria-label="Audio Studio"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 360, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="shrink-0 overflow-hidden border-l border-white/5 bg-surface/80 backdrop-blur-xl"
    >
      <div className="flex h-full w-[360px] flex-col">
        <header className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h2 className="text-[15px] font-semibold">Audio Studio</h2>
            <ProfileStatus />
          </div>
          <IconButton label="Close Audio Studio" size="sm" onClick={() => close(false)}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="px-5">
          {embedMode ? (
            <div className="flex h-16 items-center justify-center rounded-lg bg-white/[0.03] text-[11.5px] text-zinc-500">
              Spectrum needs a direct stream
            </div>
          ) : (
            <Spectrum />
          )}
        </div>
        {hydrated ? (
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-6">
            {embedMode && <EmbedNotice />}
            <VibeSection />
            <SpeedPitchSection />
            <EqSection />
            <ReverbSection />
            <LoopSection />
            <Section title="Stream source">
              <StreamSourcePicker />
            </Section>
            <ProfileActions />
          </div>
        ) : (
          <p className="px-5 py-8 text-[13px] text-zinc-500">Starting audio engine…</p>
        )}
      </div>
    </motion.aside>
  )
}

function Section({
  title,
  aside,
  disabled = false,
  children
}: {
  title: string
  aside?: ReactNode
  /** Greys out and disables every control inside (e.g. DSP sections in YouTube-player mode). */
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <section className="rounded-xl px-2 py-3">
      <fieldset disabled={disabled} className={cx('min-w-0 transition-opacity', disabled && 'opacity-40')}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">{title}</h3>
          {aside}
        </div>
        {children}
      </fieldset>
    </section>
  )
}

/** Explains why DSP controls are unavailable while the official YouTube player is in use. */
function EmbedNotice() {
  return (
    <div className="mx-2 mt-2 rounded-lg bg-amber-400/10 px-3 py-2.5 text-[12px] leading-relaxed text-amber-200/90 ring-1 ring-amber-400/20">
      <p className="font-semibold text-amber-200">Playing through YouTube's official player</p>
      <p className="mt-1 text-amber-200/75">
        YouTube currently doesn't let apps stream complete tracks directly, so EQ, pitch, reverb and the vibe
        presets are paused. Speed, A-B loops and version selection still work, and your settings are kept for when
        direct streaming is available again.
      </p>
    </div>
  )
}

function useEmbedMode(): boolean {
  return useAudioEngineStore((s) => s.backend === 'embed')
}

function Row({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-500 tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-spotify' : 'bg-white/15'
      )}
    >
      <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

function ProfileStatus() {
  const current = usePlayerStore((s) => s.current)
  const remember = useAudioEngineStore((s) => s.rememberPerTrack)
  const hasProfile = useAudioEngineStore((s) => s.hasTrackProfile)
  const text = !remember
    ? 'Settings apply to every track'
    : !current
      ? 'Changes are remembered per track'
      : hasProfile
        ? `Saved for “${current.title}”`
        : 'Using default settings for this track'
  return <p className="max-w-60 truncate text-[11.5px] text-zinc-500">{text}</p>
}

function VibeSection() {
  const embedMode = useEmbedMode()
  const dsp = useAudioEngineStore((s) => s.dsp)
  const apply = useAudioEngineStore((s) => s.applyDspPreset)
  const active = activeDspPreset(dsp)
  const styles: Record<DspPresetId, string> = {
    normal: 'from-zinc-500/25 to-zinc-500/5',
    nightcore: 'from-fuchsia-500/35 to-pink-500/5',
    'slowed-reverb': 'from-indigo-500/35 to-sky-500/5'
  }
  return (
    <Section title="Vibe" disabled={embedMode}>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(DSP_PRESETS) as DspPresetId[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={active === id}
            onClick={() => apply(id)}
            className={cx(
              'rounded-lg bg-gradient-to-br px-2 py-2.5 text-[12px] font-semibold ring-1 transition',
              styles[id],
              active === id ? 'text-zinc-50 ring-white/40' : 'text-zinc-400 ring-white/8 hover:text-zinc-200'
            )}
          >
            {DSP_PRESETS[id].label}
          </button>
        ))}
      </div>
    </Section>
  )
}

function SpeedPitchSection() {
  const embedMode = useEmbedMode()
  const dsp = useAudioEngineStore((s) => s.dsp)
  const pitchAvailable = useAudioEngineStore((s) => s.pitchShiftAvailable)
  const setSpeed = useAudioEngineStore((s) => s.setSpeed)
  const setPitch = useAudioEngineStore((s) => s.setPitch)
  const setLinked = useAudioEngineStore((s) => s.setLinked)
  const pitch = effectivePitch(dsp)

  return (
    <Section
      title="Speed & pitch"
      aside={
        <label className="flex items-center gap-2 text-[11.5px] text-zinc-400">
          <Link2 size={13} /> Linked
          <Toggle checked={dsp.linked} onChange={setLinked} label="Link pitch to speed" disabled={embedMode} />
        </label>
      }
    >
      <Row label="Speed" value={`${dsp.speed.toFixed(2)}×`}>
        <Slider label="Speed" min={SPEED_MIN} max={SPEED_MAX} step={0.01} value={dsp.speed} onChange={setSpeed} resetValue={1} valueText={`${dsp.speed.toFixed(2)}×`} />
      </Row>
      <Row label="Pitch" value={`${formatSigned(pitch, 1)} st${dsp.linked ? ' (from speed)' : ''}`}>
        <Slider
          label="Pitch"
          min={-PITCH_LIMIT_SEMITONES}
          max={PITCH_LIMIT_SEMITONES}
          step={0.1}
          value={dsp.linked ? Math.max(-PITCH_LIMIT_SEMITONES, Math.min(PITCH_LIMIT_SEMITONES, pitch)) : dsp.pitch}
          onChange={setPitch}
          bipolar
          resetValue={0}
          disabled={dsp.linked || !pitchAvailable || embedMode}
          valueText={`${formatSigned(pitch, 1)} semitones`}
        />
      </Row>
      {!pitchAvailable && <p className="text-[11px] text-amber-300/80">Independent pitch is unavailable on this system.</p>}
    </Section>
  )
}

function EqSection() {
  const embedMode = useEmbedMode()
  const dsp = useAudioEngineStore((s) => s.dsp)
  const customPresets = useAudioEngineStore((s) => s.customPresets)
  const setEqBand = useAudioEngineStore((s) => s.setEqBand)
  const applyEqPreset = useAudioEngineStore((s) => s.applyEqPreset)
  const saveCustomPreset = useAudioEngineStore((s) => s.saveCustomPreset)
  const deleteCustomPreset = useAudioEngineStore((s) => s.deleteCustomPreset)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  const isCustom = customPresets.some((p) => p.name === dsp.eqPreset)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    try {
      await saveCustomPreset(name)
      toast.success(`Saved EQ preset “${name.trim()}”`)
      setSaving(false)
      setName('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <Section
      title="Equalizer"
      disabled={embedMode}
      aside={
        <div className="flex items-center gap-1">
          <select
            aria-label="EQ preset"
            value={dsp.eqPreset ?? ''}
            onChange={(e) => applyEqPreset(e.target.value)}
            className="h-7 max-w-36 rounded-md bg-black/30 px-2 text-[12px] text-zinc-200 ring-1 ring-white/10 outline-none"
          >
            {dsp.eqPreset === null && <option value="">Custom</option>}
            <optgroup label="Built-in">
              {BUILT_IN_EQ_PRESETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            {customPresets.length > 0 && (
              <optgroup label="Yours">
                {customPresets.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {isCustom ? (
            <IconButton label="Delete preset" size="sm" onClick={() => dsp.eqPreset && void deleteCustomPreset(dsp.eqPreset)}>
              <Trash size={14} />
            </IconButton>
          ) : (
            <IconButton label="Save as preset" size="sm" onClick={() => setSaving((s) => !s)}>
              <Save size={14} />
            </IconButton>
          )}
        </div>
      }
    >
      {saving && (
        <form onSubmit={submit} className="mb-3 flex gap-1.5">
          <input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSaving(false)}
            placeholder="Preset name"
            aria-label="Preset name"
            className="h-7 min-w-0 flex-1 rounded-md bg-black/30 px-2 text-[12px] ring-1 ring-white/10 outline-none focus:ring-white/25"
          />
          <Button size="sm" variant="primary" type="submit" disabled={!name.trim()}>
            Save
          </Button>
        </form>
      )}
      <div className="flex h-36 justify-between">
        {EQ_FREQUENCIES.map((hz, i) => (
          <div key={hz} className="flex flex-col items-center gap-1.5">
            <span className="text-[9.5px] text-zinc-500 tabular-nums">{formatSigned(dsp.eq[i], 0)}</span>
            <div className="min-h-0 flex-1">
              <Slider
                vertical
                label={`${formatHz(hz)}Hz`}
                min={-EQ_GAIN_LIMIT_DB}
                max={EQ_GAIN_LIMIT_DB}
                step={0.5}
                value={dsp.eq[i]}
                onChange={(v) => setEqBand(i, v)}
                bipolar
                resetValue={0}
                accent="#1DB954"
                valueText={`${formatSigned(dsp.eq[i], 1)} dB`}
              />
            </div>
            <span className="text-[9.5px] text-zinc-400 tabular-nums">{formatHz(hz)}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

function ReverbSection() {
  const embedMode = useEmbedMode()
  const reverb = useAudioEngineStore((s) => s.dsp.reverb)
  const setReverb = useAudioEngineStore((s) => s.setReverb)
  return (
    <Section title="Reverb" disabled={embedMode}>
      <Row label="Mix" value={`${Math.round(reverb.mix * 100)}%`}>
        <Slider label="Reverb mix" min={0} max={1} step={0.01} value={reverb.mix} onChange={(mix) => setReverb({ mix })} resetValue={0} accent="#818cf8" />
      </Row>
      <Row label="Decay" value={`${reverb.decay.toFixed(1)} s`}>
        <Slider label="Reverb decay" min={REVERB_DECAY_MIN} max={REVERB_DECAY_MAX} step={0.1} value={reverb.decay} onChange={(decay) => setReverb({ decay })} resetValue={2.4} accent="#818cf8" />
      </Row>
      <Row label="Pre-delay" value={`${Math.round(reverb.preDelayMs)} ms`}>
        <Slider label="Reverb pre-delay" min={0} max={200} step={1} value={reverb.preDelayMs} onChange={(preDelayMs) => setReverb({ preDelayMs })} resetValue={20} accent="#818cf8" />
      </Row>
      <Row label="Damping" value={`${Math.round(reverb.damping * 100)}%`}>
        <Slider label="Reverb damping" min={0} max={1} step={0.01} value={reverb.damping} onChange={(damping) => setReverb({ damping })} resetValue={0.5} accent="#818cf8" />
      </Row>
    </Section>
  )
}

function LoopSection() {
  const loop = useAudioEngineStore((s) => s.loop)
  const markA = useAudioEngineStore((s) => s.markA)
  const markB = useAudioEngineStore((s) => s.markB)
  const toggleLoop = useAudioEngineStore((s) => s.toggleLoop)
  const clearLoop = useAudioEngineStore((s) => s.clearLoop)
  const hasTrack = usePlayerStore((s) => s.current !== null)

  const marker = (label: string, value: number | null, onSet: () => void) => (
    <button
      type="button"
      onClick={onSet}
      disabled={!hasTrack}
      className="flex flex-1 flex-col items-start rounded-lg bg-black/25 px-3 py-2 ring-1 ring-white/8 transition hover:ring-amber-300/40 disabled:opacity-40"
    >
      <span className="text-[10.5px] font-semibold text-amber-300">Set {label}</span>
      <span className="text-[13px] text-zinc-200 tabular-nums">{value === null ? '–:––' : formatTime(value)}</span>
    </button>
  )

  return (
    <Section
      title="A-B loop"
      aside={
        <div className="flex items-center gap-1">
          <IconButton
            label={loop.enabled ? 'Disable loop' : 'Enable loop'}
            size="sm"
            active={loop.enabled}
            disabled={loop.a === null || loop.b === null}
            onClick={toggleLoop}
          >
            <Repeat size={14} />
          </IconButton>
          <IconButton label="Clear loop" size="sm" disabled={loop.a === null && loop.b === null} onClick={clearLoop}>
            <RotateCcw size={14} />
          </IconButton>
        </div>
      }
    >
      <div className="flex gap-2">
        {marker('A', loop.a, markA)}
        {marker('B', loop.b, markB)}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">Markers are set at the playhead and remembered with the track.</p>
    </Section>
  )
}

function ProfileActions() {
  const remember = useAudioEngineStore((s) => s.rememberPerTrack)
  const setRemember = useAudioEngineStore((s) => s.setRememberPerTrack)
  const saveAsDefault = useAudioEngineStore((s) => s.saveAsDefault)
  const resetTrack = useAudioEngineStore((s) => s.resetTrackSettings)
  const hasProfile = useAudioEngineStore((s) => s.hasTrackProfile)

  return (
    <Section title="Memory">
      <label className="mb-3 flex items-center justify-between gap-3 text-[12.5px] text-zinc-300">
        Remember settings per track
        <Toggle checked={remember} onChange={(v) => void setRemember(v)} label="Remember settings per track" />
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void saveAsDefault().then(() => toast.success('Saved as default for all tracks'))}
        >
          <Save size={13} /> Save as default
        </Button>
        <Button size="sm" variant="ghost" disabled={!remember || !hasProfile} onClick={() => void resetTrack()}>
          <RotateCcw size={13} /> Reset track
        </Button>
      </div>
    </Section>
  )
}
