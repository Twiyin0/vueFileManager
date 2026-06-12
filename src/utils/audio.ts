export interface AudioTrackSource {
  name: string
  url: string
  artist: string
  cover?: string
}

export interface ResolvedAudioTrack extends AudioTrackSource {
  blobUrl: string
}

function getAudioMimeType(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
  }
  return mimeTypes[ext] || 'audio/mpeg'
}

export async function fetchAudioBlobUrl(track: AudioTrackSource): Promise<ResolvedAudioTrack> {
  const response = await fetch(track.url, {
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const sourceBlob = await response.blob()
  const mimeType = sourceBlob.type || getAudioMimeType(track.name)
  const normalizedBlob = sourceBlob.type === mimeType ? sourceBlob : new Blob([sourceBlob], { type: mimeType })

  return {
    ...track,
    blobUrl: URL.createObjectURL(normalizedBlob),
  }
}

export function revokeAudioBlobUrls(tracks: Array<{ blobUrl?: string }>) {
  tracks.forEach((track) => {
    if (track.blobUrl) {
      URL.revokeObjectURL(track.blobUrl)
    }
  })
}
