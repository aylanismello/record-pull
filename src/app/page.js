'use client'

import { useState, useEffect } from 'react'
import { supabase, supabaseConfigError } from '@/lib/supabase'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'
import { EditIcon, TrashIcon } from '@/components/Icons'
import { MODERATOR_COOKIE, canDeletePlaylist, canDeleteTrack, canDeleteVote, validateModeratorCode } from '@/lib/moderator'
import {
  PLAYER_ID_COOKIE,
  PLAYER_NAME_COOKIE,
  collectPlayerNames,
  createPlayerId,
  getVoteMarkers,
  makeUniqueDisplayName,
  normalizePlayerName,
  readCookie,
  renamePlayerReferences,
  shouldTreatVoteAsMine,
  writeCookie
} from '@/lib/playerIdentity'

export default function Home() {
  const [playlists, setPlaylists] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [updating, setUpdating] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, playlist: null })
  const [deleting, setDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(supabaseConfigError)
  const [showPromptFormFor, setShowPromptFormFor] = useState(null)
  const [promptInputs, setPromptInputs] = useState({})
  const [addingPrompt, setAddingPrompt] = useState({})
  const [trackInputs, setTrackInputs] = useState({})
  const [addingTrack, setAddingTrack] = useState({})
  const [voteInputs, setVoteInputs] = useState({})
  const [addingVote, setAddingVote] = useState({})
  const [trackDeleteModal, setTrackDeleteModal] = useState({ isOpen: false, track: null })
  const [playerId, setPlayerId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [playerNameDraft, setPlayerNameDraft] = useState('')
  const [moderatorCode, setModeratorCode] = useState('')
  const [isModerator, setIsModerator] = useState(false)
  const [moderatorMessage, setModeratorMessage] = useState('')

  async function fetchPlaylists() {
    if (!supabase) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('playlists')
      .select(`
        *,
        playlist_prompts (
          *,
          playlist_tracks (
            *,
            track_votes (*)
          )
        )
      `)
      .order('created_at', { ascending: false })
      .order('sort_order', { referencedTable: 'playlist_prompts', ascending: true })
      .order('created_at', { referencedTable: 'playlist_prompts.playlist_tracks', ascending: true })

    if (error) {
      console.error('Failed to fetch playlists:', error)
      setErrorMessage(error.message || 'Could not load playlists.')
    } else {
      setErrorMessage(null)
      setPlaylists(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPlaylists()
  }, [])

  useEffect(() => {
    let savedId = readCookie(PLAYER_ID_COOKIE)
    if (!savedId) {
      savedId = createPlayerId()
      writeCookie(PLAYER_ID_COOKIE, savedId)
    }

    const savedName = readCookie(PLAYER_NAME_COOKIE)
    const savedModerator = readCookie(MODERATOR_COOKIE)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayerId(savedId)
    if (savedModerator === 'true') {
      setIsModerator(true)
      setModeratorMessage('mod mode on')
    }
    if (savedName) {
      setPlayerName(savedName)
      setPlayerNameDraft(savedName)
    }
  }, [])

  const snobPhrases = [
    'before-they-sold-out',
    'vinyl-only',
    'you-wouldnt-get-it',
    'cassette-rip',
    'bootleg-edition',
    'limited-press',
    'import-only',
    'deep-cut',
    'unreleased-demo',
    'college-radio',
    'actually-good',
    'ironically-good',
    'secret-show',
    'diy-venue',
    'euro-import',
    'too-obscure',
    'raw-mix',
    'lo-fi-aesthetic',
    'boutique-label',
    'heard-it-first',
    'underground-classic',
    'reissue-when',
    'white-label',
    'test-pressing',
    'rare-groove',
    'only-on-bandcamp',
    'soundcloud-era',
    'never-remastered',
    'original-lineup',
    'pre-hiatus'
  ]

  async function generateSlug() {
    // Shuffle and try each phrase until we find one that doesn't exist
    const shuffled = [...snobPhrases].sort(() => Math.random() - 0.5)

    for (const phrase of shuffled) {
      const { data } = await supabase
        .from('playlists')
        .select('id')
        .eq('slug', phrase)
        .maybeSingle()

      if (!data) {
        return phrase
      }
    }

    // Fallback if somehow all are taken
    return snobPhrases[0]
  }

  async function createPlaylist(e) {
    e.preventDefault()
    if (!newName.trim() || !supabase) return

    setCreating(true)
    setErrorMessage(null)
    const slug = await generateSlug()

    const { error } = await supabase
      .from('playlists')
      .insert([{ name: newName.trim(), slug }])

    if (error) {
      console.error('Failed to create playlist:', error)
      setErrorMessage(error.message || 'Could not create playlist.')
    } else {
      setNewName('')
      setShowCreate(false)
      fetchPlaylists()
    }
    setCreating(false)
  }

  function startEdit(playlist) {
    setEditingId(playlist.id)
    setEditName(playlist.name)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
  }

  async function updatePlaylist(e, playlistId) {
    e.preventDefault()
    if (!editName.trim()) return

    setUpdating(true)
    const { error } = await supabase
      .from('playlists')
      .update({ name: editName.trim() })
      .eq('id', playlistId)

    if (error) {
      console.error('Failed to update playlist:', error)
      setErrorMessage(error.message || 'Could not update playlist.')
    } else {
      setErrorMessage(null)
      cancelEdit()
      fetchPlaylists()
    }
    setUpdating(false)
  }

  async function addPrompt(e, playlist) {
    e.preventDefault()
    const description = promptInputs[playlist.id]?.trim()
    if (!description || !supabase) return

    setAddingPrompt(prev => ({ ...prev, [playlist.id]: true }))
    setErrorMessage(null)

    const nextOrder = playlist.playlist_prompts?.length > 0
      ? Math.max(...playlist.playlist_prompts.map(prompt => prompt.sort_order || 0)) + 1
      : 0

    const { error } = await supabase
      .from('playlist_prompts')
      .insert([{
        playlist_id: playlist.id,
        description,
        sort_order: nextOrder
      }])

    if (error) {
      console.error('Failed to add prompt:', error)
      setErrorMessage(error.message || 'Could not add prompt.')
    } else {
      setPromptInputs(prev => ({ ...prev, [playlist.id]: '' }))
      setShowPromptFormFor(null)
      fetchPlaylists()
    }

    setAddingPrompt(prev => ({ ...prev, [playlist.id]: false }))
  }

  async function addTrack(promptId) {
    const name = trackInputs[promptId]?.trim()
    const currentPlayerName = playerName.trim()
    if (!name || !supabase) return
    if (!currentPlayerName || !playerId) {
      setErrorMessage('Set your game name before adding tracks.')
      return
    }

    setAddingTrack(prev => ({ ...prev, [promptId]: true }))
    setErrorMessage(null)

    const { error } = await supabase
      .from('playlist_tracks')
      .insert([{
        playlist_prompt_id: promptId,
        name,
        submitter_name: currentPlayerName,
        submitter_player_id: playerId
      }])

    if (error) {
      console.error('Failed to add track:', error)
      setErrorMessage(error.message || 'Could not add track.')
    } else {
      setTrackInputs(prev => ({ ...prev, [promptId]: '' }))
      fetchPlaylists()
    }

    setAddingTrack(prev => ({ ...prev, [promptId]: false }))
  }

  async function addVote(track, maxVotes) {
    const pickedName = voteInputs[track.id]?.trim()
    const currentPlayerName = playerName.trim()
    if (!pickedName || !currentPlayerName || !playerId || !supabase) return

    const currentVotes = track.track_votes?.length || 0
    const alreadyVoted = track.track_votes?.some(vote => shouldTreatVoteAsMine(vote, { id: playerId, displayName: currentPlayerName }))

    if (alreadyVoted) {
      setErrorMessage('You already placed your guess on this track. Delete your chip if you want a do-over.')
      return
    }

    if (pickedName.toLowerCase() === currentPlayerName.toLowerCase()) {
      setErrorMessage('No voting for yourself, sneaky gremlin. Guess who else brought this track.')
      return
    }

    if (currentVotes >= maxVotes) {
      setErrorMessage(`This track already has the max ${maxVotes} guess${maxVotes === 1 ? '' : 'es'}.`)
      return
    }

    setAddingVote(prev => ({ ...prev, [track.id]: true }))
    setErrorMessage(null)

    const guessedPlayerId = findPlayerIdByName(pickedName)

    const { error } = await supabase
      .from('track_votes')
      .insert([{
        track_id: track.id,
        voter_name: pickedName,
        voter_username: currentPlayerName,
        voter_player_id: playerId,
        guessed_player_id: guessedPlayerId
      }])

    if (error) {
      console.error('Failed to add vote:', error)
      setErrorMessage(error.message || 'Could not add vote.')
    } else {
      setVoteInputs(prev => ({ ...prev, [track.id]: '' }))
      fetchPlaylists()
    }

    setAddingVote(prev => ({ ...prev, [track.id]: false }))
  }

  function findPlayerIdByName(name) {
    const needle = normalizePlayerName(name)
    if (!needle) return null

    for (const playlist of playlists) {
      for (const prompt of playlist.playlist_prompts || []) {
        for (const track of prompt.playlist_tracks || []) {
          if (track.submitter_player_id && normalizePlayerName(track.submitter_name) === needle) {
            return track.submitter_player_id
          }
          for (const vote of track.track_votes || []) {
            if (vote.voter_player_id && normalizePlayerName(vote.voter_username) === needle) {
              return vote.voter_player_id
            }
            if (vote.guessed_player_id && normalizePlayerName(vote.voter_name) === needle) {
              return vote.guessed_player_id
            }
          }
        }
      }
    }

    return null
  }

  async function savePlayerName(e) {
    e.preventDefault()
    const requestedName = playerNameDraft.trim()
    if (!requestedName || !playerId) return

    const uniqueName = makeUniqueDisplayName(requestedName, collectPlayerNames(playlists), playerName)
    const changed = uniqueName !== playerName
    const references = renamePlayerReferences(playlists, playerId, uniqueName, playerName)

    setErrorMessage(null)

    if (supabase && changed) {
      const updates = []

      if (references.trackVoteIds.length > 0) {
        updates.push(
          supabase
            .from('track_votes')
            .update({ voter_username: uniqueName })
            .in('id', references.trackVoteIds)
        )
      }

      if (references.legacyVoterVoteIds.length > 0) {
        updates.push(
          supabase
            .from('track_votes')
            .update({ voter_username: uniqueName, voter_player_id: playerId })
            .in('id', references.legacyVoterVoteIds)
        )
      }

      if (references.guessedVoteIds.length > 0) {
        updates.push(
          supabase
            .from('track_votes')
            .update({ voter_name: uniqueName })
            .in('id', references.guessedVoteIds)
        )
      }

      if (references.legacyGuessedVoteIds.length > 0) {
        updates.push(
          supabase
            .from('track_votes')
            .update({ voter_name: uniqueName, guessed_player_id: playerId })
            .in('id', references.legacyGuessedVoteIds)
        )
      }

      if (references.trackIds.length > 0) {
        updates.push(
          supabase
            .from('playlist_tracks')
            .update({ submitter_name: uniqueName })
            .in('id', references.trackIds)
        )
      }

      if (references.legacyTrackIds.length > 0) {
        updates.push(
          supabase
            .from('playlist_tracks')
            .update({ submitter_name: uniqueName, submitter_player_id: playerId })
            .in('id', references.legacyTrackIds)
        )
      }

      const results = await Promise.all(updates)
      const failed = results.find(result => result.error)
      if (failed) {
        console.error('Failed to update player name references:', failed.error)
        setErrorMessage(failed.error.message || 'Could not update your name across the game.')
        return
      }
    }

    writeCookie(PLAYER_NAME_COOKIE, uniqueName)
    setPlayerName(uniqueName)
    setPlayerNameDraft(uniqueName)

    if (uniqueName !== requestedName) {
      setErrorMessage(`${requestedName} was already taken, so you are now ${uniqueName}.`)
    }
    fetchPlaylists()
  }

  async function deleteVote(voteId) {
    if (!supabase || !canDeleteVote({ isModerator })) return

    setErrorMessage(null)

    const { error } = await supabase
      .from('track_votes')
      .delete()
      .eq('id', voteId)

    if (error) {
      console.error('Failed to delete vote:', error)
      setErrorMessage(error.message || 'Could not delete vote.')
    } else {
      fetchPlaylists()
    }
  }

  function openTrackDeleteModal(track) {
    if (!canDeleteTrack({ isModerator })) return
    setTrackDeleteModal({ isOpen: true, track })
  }

  function closeTrackDeleteModal() {
    setTrackDeleteModal({ isOpen: false, track: null })
  }

  async function deleteTrack() {
    if (!trackDeleteModal.track || !supabase || !canDeleteTrack({ isModerator })) return

    setDeleting(true)
    setErrorMessage(null)

    const { error } = await supabase
      .from('playlist_tracks')
      .delete()
      .eq('id', trackDeleteModal.track.id)

    if (error) {
      console.error('Failed to delete track:', error)
      setErrorMessage(error.message || 'Could not delete track.')
    } else {
      closeTrackDeleteModal()
      fetchPlaylists()
    }

    setDeleting(false)
  }

  function openDeleteModal(playlist) {
    if (!canDeletePlaylist({ isModerator })) return
    setDeleteModal({ isOpen: true, playlist })
  }

  function closeDeleteModal() {
    setDeleteModal({ isOpen: false, playlist: null })
  }

  async function deletePlaylist() {
    if (!deleteModal.playlist || !canDeletePlaylist({ isModerator })) return

    setDeleting(true)
    const { error } = await supabase
      .from('playlists')
      .delete()
      .eq('id', deleteModal.playlist.id)

    if (!error) {
      fetchPlaylists()
      closeDeleteModal()
    }
    setDeleting(false)
  }

  function unlockModerator(e) {
    e.preventDefault()
    if (validateModeratorCode(moderatorCode)) {
      setIsModerator(true)
      writeCookie(MODERATOR_COOKIE, 'true')
      setModeratorCode('')
      setModeratorMessage('mod mode on')
      setErrorMessage(null)
    } else {
      setModeratorMessage('wrong code')
    }
  }

  function lockModerator() {
    setIsModerator(false)
    writeCookie(MODERATOR_COOKIE, 'false')
    setModeratorCode('')
    setModeratorMessage('mod mode off')
  }

  return (
    <main className="min-h-screen overflow-hidden px-3 py-4 sm:px-6 md:px-8 max-w-5xl mx-auto">
      <header className="mb-5 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(30,215,96,0.28),transparent_35%),linear-gradient(145deg,rgba(31,31,31,0.96),rgba(12,12,12,0.98))] p-5 shadow-2xl sm:mb-7 sm:p-8">
        <div className="mb-4 inline-flex rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">party crate</div>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl md:text-7xl">Record Pull</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-xl">Drop anonymous tracks, read the room, then guess who brought the heat. mobile-first, couch-friendly, slightly chaotic.</p>
      </header>

      <div className="mb-6 sm:mb-8">
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full rounded-full px-6 py-4 bg-[var(--accent)] text-black font-black uppercase tracking-[0.12em] shadow-[0_14px_30px_rgba(30,215,96,0.22)] hover:scale-[1.01] transition sm:w-auto"
          >
            New Playlist
          </button>
        ) : (
          <form onSubmit={createPlaylist} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Playlist name..."
              autoFocus
              className="flex-1 px-4 py-3 bg-[var(--card)] border border-[var(--border)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="flex gap-3 sm:gap-4">
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="flex-1 sm:flex-none px-6 py-3 bg-[var(--accent)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName('') }}
                className="flex-1 sm:flex-none px-6 py-3 border border-[var(--border)] text-[var(--muted)] hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <section className="mb-5 rounded-[1.5rem] border border-white/10 bg-[var(--card)]/90 p-4 shadow-xl sm:mb-6 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">How this works</div>
            <h2 className="text-xl font-semibold text-white">secret tracks, loud guesses</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Add tracks anonymously. Then guess who picked each track — but vote for everybody besides yourself.
              Each track gets <span className="text-white">one fewer guess than the number of tracks</span>, so no one can claim their own chaos.
            </p>
          </div>

          <form onSubmit={savePlayerName} className="min-w-0 sm:w-80">
            <label className="mb-2 block text-xs uppercase tracking-wide text-[var(--muted)]">Your game name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={playerNameDraft}
                onChange={(e) => setPlayerNameDraft(e.target.value)}
                placeholder="Pick a name..."
                aria-label="Your game name"
                className="min-w-0 flex-1 rounded-full px-4 py-2 bg-[var(--background)] border border-[var(--accent)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-white text-sm"
              />
              <button
                type="submit"
                disabled={!playerNameDraft.trim() || playerNameDraft.trim() === playerName}
                className="rounded-full px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {playerName ? 'Save' : 'Lock in'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className={`mb-5 rounded-[1.5rem] border p-4 shadow-xl sm:mb-6 sm:p-5 ${isModerator ? 'border-[var(--accent)]/50 bg-[rgba(30,215,96,0.08)]' : 'border-white/10 bg-[var(--card)]/80'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)]">moderator</div>
            <p className="text-sm text-[var(--muted)]">mods can delete tracks, votes, and playlists. players stay safe from accidental nuke buttons.</p>
          </div>
          {isModerator ? (
            <button type="button" onClick={lockModerator} className="rounded-full border border-white/15 px-4 py-3 text-sm font-bold text-white hover:border-white/50">Mod on · lock</button>
          ) : (
            <form onSubmit={unlockModerator} className="flex gap-2 sm:w-72">
              <input
                type="password"
                inputMode="numeric"
                value={moderatorCode}
                onChange={(e) => setModeratorCode(e.target.value)}
                placeholder="Mod code"
                aria-label="Moderator password"
                className="min-w-0 flex-1 rounded-full bg-[var(--background)] px-4 py-3 text-white ring-1 ring-white/10 placeholder:text-[var(--muted)] focus:outline-none focus:ring-[var(--accent)]"
              />
              <button type="submit" className="rounded-full bg-white px-4 py-3 text-sm font-black uppercase tracking-wide text-black">Unlock</button>
            </form>
          )}
        </div>
        {moderatorMessage && <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">{moderatorMessage}</div>}
      </section>

      {errorMessage && (
        <div className="mb-6 border border-[var(--accent)] bg-[var(--card)] p-4 text-sm text-white">
          <div className="font-medium text-[var(--accent)]">Database connection failed</div>
          <div className="mt-1 text-[var(--muted)]">{errorMessage}</div>
        </div>
      )}

      {loading ? (
        <div className="text-[var(--muted)]">Loading...</div>
      ) : playlists.length === 0 ? (
        <div className="text-[var(--muted)] text-center py-12 sm:py-16">
          No playlists yet. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {playlists.map((playlist) => (
            editingId === playlist.id ? (
              <form
                key={playlist.id}
                onSubmit={(e) => updatePlaylist(e, playlist.id)}
                className="p-4 sm:p-6 bg-[var(--card)] border border-[var(--border)]"
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 mb-3 bg-[var(--background)] border border-[var(--border)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={updating || !editName.trim()}
                    className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {updating ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-4 py-2 border border-[var(--border)] text-[var(--muted)] hover:text-white transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div
                key={playlist.id}
                className="rounded-[1.75rem] border border-white/10 bg-[rgba(24,24,24,0.92)] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.28)] transition hover:border-[var(--accent)]/60 sm:p-6"
              >
                <Link href={`/${playlist.slug}`} className="block mb-4">
                  <h2 className="text-2xl font-black tracking-tight transition-colors group-hover:text-[var(--accent)] sm:text-3xl">
                    {playlist.name}
                  </h2>
                  <p className="text-[var(--muted)] text-sm mt-1">
                    /{playlist.slug}
                  </p>
                </Link>

                {playlist.playlist_prompts?.length > 0 ? (
                  <div className="mb-4 space-y-4 border-t border-[var(--border)] pt-4">
                    {playlist.playlist_prompts.map((prompt, index) => (
                      <div key={prompt.id} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3 sm:p-4">
                        <div className="flex items-start gap-3">
                          <span className="text-[var(--accent)] font-mono text-xs mt-1">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm sm:text-base text-white break-words">
                              {prompt.description}
                            </p>
                            {prompt.playlist_tracks?.length > 0 ? (
                              <div className="mt-3 space-y-3">
                                {prompt.playlist_tracks.map((track) => {
                                  const maxVotes = Math.max((prompt.playlist_tracks?.length || 0) - 1, 0)
                                  const votes = track.track_votes || []
                                  const currentPlayer = { id: playerId, displayName: playerName }
                                  const trackIsMine = Boolean(playerId && track.submitter_player_id === playerId) || (!track.submitter_player_id && normalizePlayerName(track.submitter_name) === normalizePlayerName(playerName))
                                  const alreadyVoted = playerName && votes.some(vote => shouldTreatVoteAsMine(vote, currentPlayer))
                                  const voteLimitReached = votes.length >= maxVotes
                                  const votingDisabled = !playerName || maxVotes === 0 || voteLimitReached || alreadyVoted

                                  return (
                                    <div
                                      key={track.id}
                                      className={`rounded-[1.25rem] border px-4 py-4 text-sm text-[var(--muted)] shadow-lg transition-colors ${trackIsMine ? 'border-[var(--accent)]/60 bg-[rgba(30,215,96,0.12)] ring-1 ring-[rgba(30,215,96,0.45)]' : 'border-white/10 bg-[var(--background)]'}`}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                          <div className="text-base font-medium text-white break-words">
                                            {track.name}
                                          </div>
                                          {trackIsMine && (
                                            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">your track</div>
                                          )}
                                        </div>
                                        {canDeleteTrack({ isModerator }) && (
                                          <button
                                            type="button"
                                            onClick={() => openTrackDeleteModal(track)}
                                            className="shrink-0 rounded-full border border-white/15 px-4 py-2 text-xs font-black uppercase tracking-wide text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                                            aria-label={`Delete track ${track.name}`}
                                          >
                                            Delete
                                          </button>
                                        )}
                                      </div>

                                      <div className="mt-3">
                                        <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-wide text-[var(--muted)]">
                                          <span>Who picked it?</span>
                                          <span>{votes.length}/{maxVotes} guesses</span>
                                        </div>

                                        {votes.length > 0 && (
                                          <div className="mb-3 flex flex-wrap gap-2">
                                            {votes.map((vote) => {
                                              const { isMine, isAboutMe } = getVoteMarkers(vote, currentPlayer)
                                              return (
                                                <span
                                                  key={vote.id}
                                                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ${isMine ? 'border-[var(--accent)] bg-[rgba(30,215,96,0.18)] text-white' : isAboutMe ? 'border-white bg-white text-black' : 'border-white/10 bg-[var(--card)] text-white'}`}
                                                >
                                                  {isMine && <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">you guessed</span>}
                                                  {isAboutMe && !isMine && <span className="text-[10px] font-semibold uppercase tracking-wide text-black/60">you?</span>}
                                                  <span>{vote.voter_name}</span>
                                                  <span className={isAboutMe ? 'text-black/55' : 'text-[var(--muted)]'}>← guessed by {vote.voter_username || 'someone mysterious'}</span>
                                                  {canDeleteVote({ isModerator }) && (
                                                    <button
                                                      type="button"
                                                      onClick={() => deleteVote(vote.id)}
                                                      className={isAboutMe ? 'text-black/50 hover:text-black transition-colors' : 'text-[var(--muted)] hover:text-[var(--accent)] transition-colors'}
                                                      aria-label={`Delete vote for ${vote.voter_name}`}
                                                    >
                                                      ×
                                                    </button>
                                                  )}
                                                </span>
                                              )
                                            })}
                                          </div>
                                        )}

                                        <div className="flex flex-col sm:flex-row gap-2">
                                          <input
                                            type="text"
                                            value={voteInputs[track.id] || ''}
                                            onChange={(e) => setVoteInputs(prev => ({
                                              ...prev,
                                              [track.id]: e.target.value
                                            }))}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault()
                                                addVote(track, maxVotes)
                                              }
                                            }}
                                            placeholder={!playerName ? 'Set your game name first...' : maxVotes === 0 ? 'Need at least 2 tracks to guess' : alreadyVoted ? 'You already guessed this one' : voteLimitReached ? 'Guess limit reached' : 'Who do you think picked this?'}
                                            disabled={votingDisabled}
                                            className="flex-1 rounded-full px-4 py-3 bg-[var(--card)] ring-1 ring-white/10 text-white placeholder:text-[var(--muted)] focus:outline-none focus:ring-[var(--accent)] disabled:opacity-50 text-sm"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => addVote(track, maxVotes)}
                                            disabled={addingVote[track.id] || votingDisabled || !voteInputs[track.id]?.trim()}
                                            className="w-full rounded-full px-5 py-3 border border-[var(--accent)] text-white text-sm font-black uppercase tracking-wide hover:bg-[var(--accent)] hover:text-black transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-white sm:w-auto"
                                          >
                                            {addingVote[track.id] ? 'Guessing...' : 'Guess'}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <p className="mt-2 text-xs text-[var(--muted)]">No tracks yet.</p>
                            )}

                            <div className="mt-3 flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                value={trackInputs[prompt.id] || ''}
                                onChange={(e) => setTrackInputs(prev => ({
                                  ...prev,
                                  [prompt.id]: e.target.value
                                }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    addTrack(prompt.id)
                                  }
                                }}
                                placeholder="Add a track..."
                                className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => addTrack(prompt.id)}
                                disabled={addingTrack[prompt.id] || !trackInputs[prompt.id]?.trim()}
                                className="w-full sm:w-auto px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                              >
                                {addingTrack[prompt.id] ? '...' : 'Submit'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mb-4 border-t border-[var(--border)] pt-4 text-sm text-[var(--muted)]">
                    No prompts yet.
                  </p>
                )}

                <div className="mb-4 border-t border-[var(--border)] pt-4">
                  {showPromptFormFor === playlist.id ? (
                    <form onSubmit={(e) => addPrompt(e, playlist)} className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <input
                        type="text"
                        value={promptInputs[playlist.id] || ''}
                        onChange={(e) => setPromptInputs(prev => ({
                          ...prev,
                          [playlist.id]: e.target.value
                        }))}
                        placeholder="What kind of tracks are you looking for?"
                        autoFocus
                        className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={addingPrompt[playlist.id] || !promptInputs[playlist.id]?.trim()}
                          className="flex-1 sm:flex-none px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {addingPrompt[playlist.id] ? 'Adding...' : 'Add'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPromptFormFor(null)
                            setPromptInputs(prev => ({ ...prev, [playlist.id]: '' }))
                          }}
                          className="flex-1 sm:flex-none px-4 py-2 border border-[var(--border)] text-[var(--muted)] hover:text-white transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowPromptFormFor(playlist.id)}
                      className="w-full sm:w-auto px-4 py-2 border border-[var(--border)] text-[var(--muted)] hover:text-white hover:border-white transition-colors text-sm"
                    >
                      + Add Prompt
                    </button>
                  )}
                </div>

                {isModerator && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => startEdit(playlist)}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-3 text-sm font-bold text-[var(--muted)] transition-colors hover:border-white/40 hover:text-white"
                      aria-label="Edit playlist"
                    >
                      <EditIcon className="w-5 h-5 sm:w-4 sm:h-4" />
                      Edit playlist
                    </button>
                    <button
                      onClick={() => openDeleteModal(playlist)}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-3 text-sm font-bold text-[var(--muted)] transition-colors hover:border-[var(--accent-hot)] hover:text-[var(--accent-hot)]"
                      aria-label="Delete playlist"
                    >
                      <TrashIcon className="w-5 h-5 sm:w-4 sm:h-4" />
                      Delete playlist
                    </button>
                  </div>
                )}
              </div>
            )
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={trackDeleteModal.isOpen}
        onClose={closeTrackDeleteModal}
        onConfirm={deleteTrack}
        title="Delete Track"
        message={`Delete "${trackDeleteModal.track?.name}"? This will also delete all votes for this track.`}
        isDeleting={deleting}
      />

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        onConfirm={deletePlaylist}
        title="Delete Playlist"
        message={`Are you sure you want to delete "${deleteModal.playlist?.name}"? This will also delete all prompts and tracks in this playlist.`}
        isDeleting={deleting}
      />
    </main>
  )
}
