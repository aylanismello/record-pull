import { normalizePlayerName } from './playerIdentity.js'

export function collectPlaylistPlayers(playlist) {
  const players = new Map()

  function addPlayer(id, name) {
    const displayName = String(name || '').trim()
    const key = id || normalizePlayerName(displayName)
    if (!key || !displayName) return
    if (!players.has(key)) {
      players.set(key, { id: id || null, name: displayName })
    }
  }

  for (const prompt of playlist?.playlist_prompts || []) {
    for (const track of prompt.playlist_tracks || []) {
      addPlayer(track.submitter_player_id, track.submitter_name)
      for (const vote of track.track_votes || []) {
        addPlayer(vote.voter_player_id, vote.voter_username)
        addPlayer(vote.guessed_player_id, vote.voter_name)
      }
    }
  }

  return [...players.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function playerOptionsForTrack(playlist, track, currentPlayerId) {
  return collectPlaylistPlayers(playlist).filter(player => {
    if (currentPlayerId && player.id === currentPlayerId) return false
    if (track?.submitter_player_id && player.id === track.submitter_player_id) return true
    return true
  })
}

export function isCorrectGuess(vote, track) {
  if (!vote || !track) return false
  if (vote.guessed_player_id && track.submitter_player_id) {
    return vote.guessed_player_id === track.submitter_player_id
  }
  return normalizePlayerName(vote.voter_name) === normalizePlayerName(track.submitter_name)
}

export function scorePlaylist(playlist) {
  const scores = new Map()

  for (const prompt of playlist?.playlist_prompts || []) {
    for (const track of prompt.playlist_tracks || []) {
      for (const vote of track.track_votes || []) {
        const voterName = vote.voter_username || 'someone mysterious'
        const key = vote.voter_player_id || normalizePlayerName(voterName)
        if (!key) continue
        const current = scores.get(key) || { playerId: vote.voter_player_id || null, name: voterName, correct: 0, total: 0 }
        current.total += 1
        if (isCorrectGuess(vote, track)) current.correct += 1
        scores.set(key, current)
      }
    }
  }

  return [...scores.values()].sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name))
}
