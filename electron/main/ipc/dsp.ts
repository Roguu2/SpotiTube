import { IpcChannels } from '@core/ipc'
import {
  getDspState,
  getTrackProfile,
  saveCustomPresets,
  saveGlobalDsp,
  saveTrackProfile,
  setRememberPerTrack
} from '../services/dspStore'
import { handle, requireString } from './handle'

export function registerDspIpc(): void {
  handle(IpcChannels.dspGetState, () => getDspState())
  handle(IpcChannels.dspSaveGlobal, (settings: unknown) => saveGlobalDsp(settings))
  handle(IpcChannels.dspSetRememberPerTrack, (enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean')
    setRememberPerTrack(enabled)
  })
  handle(IpcChannels.dspSaveCustomPresets, (presets: unknown) => saveCustomPresets(presets))
  handle(IpcChannels.dspGetTrackProfile, (trackId: unknown) => getTrackProfile(requireString(trackId, 'trackId')))
  handle(IpcChannels.dspSaveTrackProfile, (trackId: unknown, profile: unknown) => {
    const id = requireString(trackId, 'trackId')
    if (profile === null) {
      saveTrackProfile(id, null)
      return
    }
    if (!profile || typeof profile !== 'object') throw new TypeError('Invalid DSP profile')
    const { dsp, loop } = profile as { dsp: unknown; loop: unknown }
    saveTrackProfile(id, { dsp, loop })
  })
}
