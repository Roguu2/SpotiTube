import { IpcChannels, type RadioQuery } from '@core/ipc'
import { addRecent, getCountries, getMapStations, getSaved, getTags, searchStations, setFavorite } from '../services/radio'
import { handle } from './handle'

/** The Radio tab: Radio Browser's directory, plus favorite and recent stations kept on this computer. */
export function registerRadioIpc(): void {
  handle(IpcChannels.radioGetMap, () => getMapStations())
  handle(IpcChannels.radioSearch, (query: unknown) => {
    if (!query || typeof query !== 'object') throw new TypeError('Invalid radio search')
    return searchStations(query as RadioQuery)
  })
  handle(IpcChannels.radioGetCountries, () => getCountries())
  handle(IpcChannels.radioGetTags, () => getTags())
  handle(IpcChannels.radioGetSaved, () => getSaved())
  handle(IpcChannels.radioSetFavorite, (station: unknown, favorite: unknown) => setFavorite(station, favorite === true))
  handle(IpcChannels.radioAddRecent, (station: unknown) => addRecent(station))
}
