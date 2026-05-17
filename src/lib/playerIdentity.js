export const PLAYER_ID_COOKIE = 'record_pull_player_id'
export const PLAYER_NAME_COOKIE = 'record_pull_player_name'
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 20

export function normalizePlayerName(name) {
  return name?.trim().replace(/\s+/g, ' ').toLowerCase() || ''
}

export function stripNumericSuffix(name) {
  return name.trim().replace(/\s+\d+$/, '')
}

export function makeUniqueDisplayName(requestedName, existingNames = [], currentName = '') {
  const trimmed = requestedName.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''

  const currentKey = normalizePlayerName(currentName)
  const taken = new Set(
    existingNames
      .map(normalizePlayerName)
      .filter(Boolean)
      .filter(name => name !== currentKey)
  )

  if (!taken.has(normalizePlayerName(trimmed))) return trimmed

  const base = stripNumericSuffix(trimmed)
  let suffix = 2
  let candidate = `${base} ${suffix}`

  while (taken.has(normalizePlayerName(candidate))) {
    suffix += 1
    candidate = `${base} ${suffix}`
  }

  return candidate
}

export function createPlayerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `player-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function readCookie(name) {
  if (typeof document === 'undefined') return ''

  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${name}=`))

  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : ''
}

export function writeCookie(name, value) {
  if (typeof document === 'undefined') return

  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`
}

export function shouldTreatVoteAsMine(vote, player) {
  if (vote.voter_player_id && player?.id) {
    return vote.voter_player_id === player.id
  }

  return normalizePlayerName(vote.voter_username) === normalizePlayerName(player?.displayName)
}

export function renamePlayerReferences(playlists, playerId, nextDisplayName) {
  const trackVoteIds = []
  const trackIds = []

  playlists.forEach(playlist => {
    ;(playlist.playlist_prompts || []).forEach(prompt => {
      ;(prompt.playlist_tracks || []).forEach(track => {
        if (track.submitter_player_id === playerId && track.submitter_name !== nextDisplayName) {
          trackIds.push(track.id)
        }

        ;(track.track_votes || []).forEach(vote => {
          if (vote.voter_player_id === playerId && vote.voter_username !== nextDisplayName) {
            trackVoteIds.push(vote.id)
          }
        })
      })
    })
  })

  return { trackVoteIds, trackIds }
}

export function collectPlayerNames(playlists) {
  const names = []

  playlists.forEach(playlist => {
    ;(playlist.playlist_prompts || []).forEach(prompt => {
      ;(prompt.playlist_tracks || []).forEach(track => {
        if (track.submitter_name) names.push(track.submitter_name)
        ;(track.track_votes || []).forEach(vote => {
          if (vote.voter_username) names.push(vote.voter_username)
          if (vote.voter_name) names.push(vote.voter_name)
        })
      })
    })
  })

  return names
}
