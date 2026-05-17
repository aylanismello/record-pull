'use client'

import { useState, useEffect } from 'react'
import { supabase, supabaseConfigError } from '@/lib/supabase'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'
import { EditIcon, TrashIcon } from '@/components/Icons'

const PLAYER_COOKIE = 'record_pull_player_name'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 20

function readPlayerNameCookie() {
  if (typeof document === 'undefined') return ''

  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${PLAYER_COOKIE}=`))

  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : ''
}

function writePlayerNameCookie(name) {
  if (typeof document === 'undefined') return

  document.cookie = `${PLAYER_COOKIE}=${encodeURIComponent(name)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`
}

function normalizeName(name) {
  return name?.trim().toLowerCase() || ''
}

function uniqueNames(names) {
  const seen = new Set()
  return names
    .map(name => name?.trim())
    .filter(Boolean)
    .filter(name => {
      const key = normalizeName(name)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.localeCompare(b))
}

function getPromptRoster(prompt, playerName) {
  return uniqueNames([
    playerName,
    ...(prompt.playlist_tracks || []).map(track => track.submitter_name),
    ...(prompt.playlist_tracks || []).flatMap(track => (track.track_votes || []).flatMap(vote => [
      vote.voter_name,
      vote.voter_username
    ]))
  ])
}

function getPlaylistStats(playlist, playerName) {
  const prompts = playlist.playlist_prompts || []
  const tracks = prompts.flatMap(prompt => prompt.playlist_tracks || [])
  const guessableTracks = tracks.filter(track => normalizeName(track.submitter_name) !== normalizeName(playerName))
  const myGuesses = guessableTracks.filter(track => (track.track_votes || []).some(
    vote => normalizeName(vote.voter_username) === normalizeName(playerName)
  ))
  const totalGuesses = tracks.reduce((total, track) => total + (track.track_votes?.length || 0), 0)
  const correctGuesses = tracks.reduce((total, track) => total + (track.track_votes || []).filter(
    vote => normalizeName(vote.voter_name) === normalizeName(track.submitter_name)
  ).length, 0)

  return {
    prompts: prompts.length,
    tracks: tracks.length,
    guessableTracks: guessableTracks.length,
    myGuesses: myGuesses.length,
    totalGuesses,
    correctGuesses
  }
}

function getLeaderboard(playlist) {
  const scores = new Map()

  ;(playlist.playlist_prompts || []).forEach(prompt => {
    ;(prompt.playlist_tracks || []).forEach(track => {
      ;(track.track_votes || []).forEach(vote => {
        const player = vote.voter_username || 'someone mysterious'
        const current = scores.get(player) || { player, correct: 0, total: 0 }
        current.total += 1
        if (normalizeName(vote.voter_name) === normalizeName(track.submitter_name)) {
          current.correct += 1
        }
        scores.set(player, current)
      })
    })
  })

  return [...scores.values()].sort((a, b) => b.correct - a.correct || b.total - a.total || a.player.localeCompare(b.player))
}

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
  const [addingVote, setAddingVote] = useState({})
  const [trackDeleteModal, setTrackDeleteModal] = useState({ isOpen: false, track: null })
  const [playerName, setPlayerName] = useState('')
  const [playerNameDraft, setPlayerNameDraft] = useState('')
  const [editingPlayerName, setEditingPlayerName] = useState(false)

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
    const savedName = readPlayerNameCookie()
    if (savedName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlayerName(savedName)
      setPlayerNameDraft(savedName)
    }
  }, [])

  const snobPhrases = [
    'before-they-sold-out', 'vinyl-only', 'you-wouldnt-get-it', 'cassette-rip',
    'bootleg-edition', 'limited-press', 'import-only', 'deep-cut', 'unreleased-demo',
    'college-radio', 'actually-good', 'ironically-good', 'secret-show', 'diy-venue',
    'euro-import', 'too-obscure', 'raw-mix', 'lo-fi-aesthetic', 'boutique-label',
    'heard-it-first', 'underground-classic', 'reissue-when', 'white-label',
    'test-pressing', 'rare-groove', 'only-on-bandcamp', 'soundcloud-era',
    'never-remastered', 'original-lineup', 'pre-hiatus'
  ]

  async function generateSlug() {
    const shuffled = [...snobPhrases].sort(() => Math.random() - 0.5)

    for (const phrase of shuffled) {
      const { data } = await supabase
        .from('playlists')
        .select('id')
        .eq('slug', phrase)
        .maybeSingle()

      if (!data) return phrase
    }

    return `${snobPhrases[0]}-${Date.now()}`
  }

  async function createPlaylist(e) {
    e.preventDefault()
    if (!newName.trim() || !supabase) return

    setCreating(true)
    setErrorMessage(null)
    const slug = await generateSlug()

    const { error } = await supabase
      .from('playlists')
      .insert([{ name: newName.trim(), slug, is_revealed: false }])

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
      .insert([{ playlist_id: playlist.id, description, sort_order: nextOrder }])

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
    const submitterName = playerName.trim()
    if (!name || !submitterName || !supabase) {
      if (!submitterName) setErrorMessage('Set your game name before adding anonymous tracks.')
      return
    }

    setAddingTrack(prev => ({ ...prev, [promptId]: true }))
    setErrorMessage(null)

    const { error } = await supabase
      .from('playlist_tracks')
      .insert([{ playlist_prompt_id: promptId, name, submitter_name: submitterName }])

    if (error) {
      console.error('Failed to add track:', error)
      setErrorMessage(error.message || 'Could not add track.')
    } else {
      setTrackInputs(prev => ({ ...prev, [promptId]: '' }))
      fetchPlaylists()
    }

    setAddingTrack(prev => ({ ...prev, [promptId]: false }))
  }

  async function addVote(track, pickedName, maxVotes) {
    const currentPlayerName = playerName.trim()
    const guessedName = pickedName.trim()
    if (!guessedName || !currentPlayerName || !supabase) return

    const currentVotes = track.track_votes?.length || 0
    const alreadyVoted = track.track_votes?.some(vote => normalizeName(vote.voter_username) === normalizeName(currentPlayerName))

    if (alreadyVoted) {
      setErrorMessage('You already guessed this track. Delete your chip if you want a do-over.')
      return
    }

    if (normalizeName(track.submitter_name) === normalizeName(currentPlayerName)) {
      setErrorMessage('That one is yours. No voting on your own track.')
      return
    }

    if (normalizeName(guessedName) === normalizeName(currentPlayerName)) {
      setErrorMessage('No voting for yourself, sneaky gremlin. Guess who else brought this track.')
      return
    }

    if (currentVotes >= maxVotes) {
      setErrorMessage(`This track already has the max ${maxVotes} guess${maxVotes === 1 ? '' : 'es'}.`)
      return
    }

    setAddingVote(prev => ({ ...prev, [track.id]: true }))
    setErrorMessage(null)

    const { error } = await supabase
      .from('track_votes')
      .insert([{ track_id: track.id, voter_name: guessedName, voter_username: currentPlayerName }])

    if (error) {
      console.error('Failed to add guess:', error)
      setErrorMessage(error.message || 'Could not add guess.')
    } else {
      fetchPlaylists()
    }

    setAddingVote(prev => ({ ...prev, [track.id]: false }))
  }

  async function deleteVote(voteId) {
    if (!supabase) return

    setErrorMessage(null)
    const { error } = await supabase
      .from('track_votes')
      .delete()
      .eq('id', voteId)

    if (error) {
      console.error('Failed to delete guess:', error)
      setErrorMessage(error.message || 'Could not delete guess.')
    } else {
      fetchPlaylists()
    }
  }

  async function toggleReveal(playlist) {
    if (!supabase) return

    const nextValue = !playlist.is_revealed
    setErrorMessage(null)
    const { error } = await supabase
      .from('playlists')
      .update({ is_revealed: nextValue })
      .eq('id', playlist.id)

    if (error) {
      console.error('Failed to update reveal state:', error)
      setErrorMessage(error.message || 'Could not update reveal state.')
    } else {
      fetchPlaylists()
    }
  }

  function savePlayerName(e) {
    e.preventDefault()
    const name = playerNameDraft.trim()
    if (!name) return

    writePlayerNameCookie(name)
    setPlayerName(name)
    setPlayerNameDraft(name)
    setEditingPlayerName(false)
    setErrorMessage(null)
  }

  function openTrackDeleteModal(track) {
    setTrackDeleteModal({ isOpen: true, track })
  }

  function closeTrackDeleteModal() {
    setTrackDeleteModal({ isOpen: false, track: null })
  }

  async function deleteTrack() {
    if (!trackDeleteModal.track || !supabase) return

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
    setDeleteModal({ isOpen: true, playlist })
  }

  function closeDeleteModal() {
    setDeleteModal({ isOpen: false, playlist: null })
  }

  async function deletePlaylist() {
    if (!deleteModal.playlist) return

    setDeleting(true)
    const { error } = await supabase
      .from('playlists')
      .delete()
      .eq('id', deleteModal.playlist.id)

    if (error) {
      console.error('Failed to delete playlist:', error)
      setErrorMessage(error.message || 'Could not delete playlist.')
    } else {
      fetchPlaylists()
      closeDeleteModal()
    }
    setDeleting(false)
  }

  return (
    <main className="min-h-screen pb-28 px-3 pt-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
      <header className="mb-6 sm:mb-10">
        <div className="text-xs uppercase tracking-[0.35em] text-[var(--accent)] mb-3">anonymous aux cord mafia</div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight mb-2">Record Pull</h1>
        <p className="text-[var(--muted)] text-base sm:text-lg max-w-2xl">
          Secretly add tracks, guess who brought what, then reveal the damage.
        </p>
      </header>

      <section className="sticky top-2 z-20 mb-5 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_92%,transparent)] p-3 shadow-2xl backdrop-blur sm:static sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">Game loop</div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Add tracks hidden under your name → guess everyone else → reveal + score.
            </p>
          </div>
          <form onSubmit={savePlayerName} className="sm:w-80">
            <label className="mb-1 block text-xs uppercase tracking-wide text-[var(--muted)]">Your game name</label>
            {playerName && !editingPlayerName ? (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded-full border border-[var(--accent)] bg-[var(--background)] px-4 py-2 text-sm font-bold text-white">
                  {playerName}
                </div>
                <button
                  type="button"
                  onClick={() => { setEditingPlayerName(true); setPlayerNameDraft(playerName) }}
                  className="rounded-full border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] hover:text-white"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={playerNameDraft}
                  onChange={(e) => setPlayerNameDraft(e.target.value)}
                  placeholder="Pick a name..."
                  className="min-w-0 flex-1 rounded-full bg-[var(--background)] border border-[var(--border)] px-4 py-2 text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] text-sm"
                />
                <button
                  type="submit"
                  disabled={!playerNameDraft.trim()}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Lock
                </button>
              </div>
            )}
          </form>
        </div>
      </section>

      <div className="mb-5 sm:mb-8">
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full rounded-2xl bg-[var(--accent)] px-6 py-4 text-base font-black text-white hover:opacity-90 sm:w-auto sm:py-3"
          >
            + Create game
          </button>
        ) : (
          <form onSubmit={createPlaylist} className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:flex-row sm:p-4">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Game / playlist name..."
              autoFocus
              className="flex-1 rounded-xl bg-[var(--background)] border border-[var(--border)] px-4 py-3 text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="flex-1 rounded-xl bg-[var(--accent)] px-5 py-3 font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName('') }}
                className="flex-1 rounded-xl border border-[var(--border)] px-5 py-3 text-[var(--muted)] hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {errorMessage && (
        <div className="mb-6 rounded-2xl border border-[var(--accent)] bg-[var(--card)] p-4 text-sm text-white">
          <div className="font-bold text-[var(--accent)]">Heads up</div>
          <div className="mt-1 text-[var(--muted)]">{errorMessage}</div>
        </div>
      )}

      {loading ? (
        <div className="text-[var(--muted)]">Loading...</div>
      ) : playlists.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--border)] py-16 text-center text-[var(--muted)]">
          No games yet. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-5">
          {playlists.map((playlist) => {
            const stats = getPlaylistStats(playlist, playerName)
            const leaderboard = getLeaderboard(playlist)

            return editingId === playlist.id ? (
              <form
                key={playlist.id}
                onSubmit={(e) => updatePlaylist(e, playlist.id)}
                className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6"
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mb-3 w-full rounded-xl bg-[var(--background)] border border-[var(--border)] px-3 py-2 text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={updating || !editName.trim()}
                    className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {updating ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <article
                key={playlist.id}
                className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[linear-gradient(180deg,#141414_0%,#0d0d0d_100%)] shadow-2xl"
              >
                <div className="border-b border-[var(--border)] p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/${playlist.slug}`} className="min-w-0 flex-1">
                      <div className="mb-2 inline-flex rounded-full border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-wide text-[var(--muted)]">
                        {playlist.is_revealed ? 'reveal phase' : 'guessing phase'}
                      </div>
                      <h2 className="break-words text-2xl font-black tracking-tight sm:text-3xl">
                        {playlist.name}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">/{playlist.slug}</p>
                    </Link>

                    <details className="relative shrink-0">
                      <summary className="list-none rounded-full border border-[var(--border)] px-3 py-2 text-lg leading-none text-[var(--muted)] hover:text-white cursor-pointer">
                        •••
                      </summary>
                      <div className="absolute right-0 z-10 mt-2 w-44 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-2xl">
                        <button
                          onClick={() => startEdit(playlist)}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[var(--background)] hover:text-white"
                        >
                          <EditIcon className="h-4 w-4" /> Edit game
                        </button>
                        <button
                          onClick={() => openDeleteModal(playlist)}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--accent)]"
                        >
                          <TrashIcon className="h-4 w-4" /> Delete game
                        </button>
                      </div>
                    </details>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs sm:max-w-md">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3">
                      <div className="text-lg font-black text-white">{stats.tracks}</div>
                      <div className="text-[var(--muted)]">tracks</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3">
                      <div className="text-lg font-black text-white">{stats.myGuesses}/{stats.guessableTracks}</div>
                      <div className="text-[var(--muted)]">yours</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3">
                      <div className="text-lg font-black text-white">{stats.totalGuesses}</div>
                      <div className="text-[var(--muted)]">guesses</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => toggleReveal(playlist)}
                      className="rounded-2xl border border-[var(--accent)] px-4 py-3 text-sm font-black text-white hover:bg-[var(--accent)]"
                    >
                      {playlist.is_revealed ? 'Hide reveal' : 'Reveal results'}
                    </button>
                    {!playlist.is_revealed && stats.guessableTracks > stats.myGuesses && (
                      <div className="rounded-2xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
                        {stats.guessableTracks - stats.myGuesses} track{stats.guessableTracks - stats.myGuesses === 1 ? '' : 's'} still need your guess.
                      </div>
                    )}
                  </div>
                </div>

                {playlist.is_revealed && (
                  <section className="border-b border-[var(--border)] bg-[var(--background)] p-4 sm:p-6">
                    <div className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)]">Results</div>
                    {leaderboard.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {leaderboard.map((score, index) => (
                          <div key={score.player} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                            <span className="font-bold">{index + 1}. {score.player}</span>
                            <span className="text-sm text-[var(--muted)]">{score.correct}/{score.total} correct</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-[var(--muted)]">No guesses yet.</div>
                    )}
                  </section>
                )}

                <div className="p-4 sm:p-6">
                  {playlist.playlist_prompts?.length > 0 ? (
                    <div className="space-y-5">
                      {playlist.playlist_prompts.map((prompt, index) => {
                        const roster = getPromptRoster(prompt, playerName)

                        return (
                          <section key={prompt.id} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5">
                            <div className="sticky top-24 z-10 -mx-3 -mt-3 mb-4 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_95%,transparent)] px-3 py-3 backdrop-blur sm:static sm:-mx-5 sm:-mt-5 sm:px-5">
                              <div className="flex items-start gap-3">
                                <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 font-mono text-xs font-black text-white">
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <h3 className="break-words text-base font-bold text-white sm:text-lg">{prompt.description}</h3>
                                  <p className="mt-1 text-xs text-[var(--muted)]">
                                    {prompt.playlist_tracks?.length || 0} tracks · tap a name chip to guess
                                  </p>
                                </div>
                              </div>
                            </div>

                            {prompt.playlist_tracks?.length > 0 ? (
                              <div className="space-y-3">
                                {prompt.playlist_tracks.map((track, trackIndex) => {
                                  const maxVotes = Math.max((prompt.playlist_tracks?.length || 0) - 1, 0)
                                  const votes = track.track_votes || []
                                  const isMine = normalizeName(track.submitter_name) === normalizeName(playerName)
                                  const alreadyVoted = playerName && votes.some(vote => normalizeName(vote.voter_username) === normalizeName(playerName))
                                  const voteLimitReached = votes.length >= maxVotes
                                  const canGuess = playerName && !playlist.is_revealed && !isMine && !alreadyVoted && !voteLimitReached && maxVotes > 0
                                  const correctVotes = votes.filter(vote => normalizeName(vote.voter_name) === normalizeName(track.submitter_name))

                                  return (
                                    <div
                                      key={track.id}
                                      className="rounded-3xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-xl"
                                    >
                                      <div className="mb-3 flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                          <div className="mb-1 text-xs font-mono text-[var(--accent)]">track {trackIndex + 1}</div>
                                          <div className="break-words text-xl font-black text-white">{track.name}</div>
                                          {playlist.is_revealed ? (
                                            <div className="mt-2 inline-flex rounded-full border border-[var(--accent)] bg-[var(--card)] px-3 py-1 text-xs font-bold text-white">
                                              picked by {track.submitter_name || 'unknown'}
                                            </div>
                                          ) : isMine ? (
                                            <div className="mt-2 inline-flex rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--muted)]">
                                              your hidden track
                                            </div>
                                          ) : null}
                                        </div>

                                        <details className="relative shrink-0">
                                          <summary className="list-none rounded-full border border-[var(--border)] px-3 py-2 text-[var(--muted)] hover:text-white cursor-pointer">•••</summary>
                                          <div className="absolute right-0 z-10 mt-2 w-36 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-2xl">
                                            <button
                                              type="button"
                                              onClick={() => openTrackDeleteModal(track)}
                                              className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--accent)]"
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </details>
                                      </div>

                                      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wide text-[var(--muted)]">
                                        <span>{playlist.is_revealed ? 'guesses' : 'who picked this?'}</span>
                                        <span>{votes.length}/{maxVotes}</span>
                                      </div>

                                      {votes.length > 0 && (
                                        <div className="mb-4 flex flex-wrap gap-2">
                                          {votes.map((vote) => {
                                            const correct = normalizeName(vote.voter_name) === normalizeName(track.submitter_name)
                                            return (
                                              <span
                                                key={vote.id}
                                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${playlist.is_revealed && correct ? 'border-green-500/60 bg-green-500/10 text-green-200' : 'border-[var(--border)] bg-[var(--card)] text-white'}`}
                                              >
                                                <span>{vote.voter_name}</span>
                                                <span className="text-[var(--muted)]">← {vote.voter_username || 'mystery'}</span>
                                                {!playlist.is_revealed && (
                                                  <button
                                                    type="button"
                                                    onClick={() => deleteVote(vote.id)}
                                                    className="text-[var(--muted)] hover:text-[var(--accent)]"
                                                    aria-label={`Delete guess for ${vote.voter_name}`}
                                                  >
                                                    ×
                                                  </button>
                                                )}
                                              </span>
                                            )
                                          })}
                                        </div>
                                      )}

                                      {playlist.is_revealed && (
                                        <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)]">
                                          {correctVotes.length > 0
                                            ? `${correctVotes.map(vote => vote.voter_username).join(', ')} called it.`
                                            : 'nobody guessed this one. brutal.'}
                                        </div>
                                      )}

                                      {!playlist.is_revealed && (
                                        <div>
                                          {!playerName ? (
                                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)]">
                                              Set your game name first.
                                            </div>
                                          ) : isMine ? (
                                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)]">
                                              This is yours, so you sit this guess out.
                                            </div>
                                          ) : alreadyVoted ? (
                                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)]">
                                              You guessed this one already.
                                            </div>
                                          ) : maxVotes === 0 ? (
                                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)]">
                                              Need at least 2 tracks before guessing.
                                            </div>
                                          ) : voteLimitReached ? (
                                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)]">
                                              Guess limit reached.
                                            </div>
                                          ) : (
                                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                                              {roster.filter(name => normalizeName(name) !== normalizeName(playerName)).map(name => (
                                                <button
                                                  key={name}
                                                  type="button"
                                                  onClick={() => addVote(track, name, maxVotes)}
                                                  disabled={!canGuess || addingVote[track.id]}
                                                  className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-white hover:border-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-50"
                                                >
                                                  {name}
                                                </button>
                                              ))}
                                              {roster.filter(name => normalizeName(name) !== normalizeName(playerName)).length === 0 && (
                                                <div className="col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)]">
                                                  Add tracks from at least one other player to build the roster.
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <p className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">No tracks yet.</p>
                            )}

                            {!playlist.is_revealed && (
                              <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--background)] p-3">
                                <label className="mb-2 block text-xs uppercase tracking-wide text-[var(--muted)]">add your secret track</label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <input
                                    type="text"
                                    value={trackInputs[prompt.id] || ''}
                                    onChange={(e) => setTrackInputs(prev => ({ ...prev, [prompt.id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        addTrack(prompt.id)
                                      }
                                    }}
                                    placeholder={playerName ? 'Track + artist...' : 'Set your game name first...'}
                                    disabled={!playerName}
                                    className="flex-1 rounded-2xl bg-[var(--card)] border border-[var(--border)] px-4 py-3 text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => addTrack(prompt.id)}
                                    disabled={addingTrack[prompt.id] || !trackInputs[prompt.id]?.trim() || !playerName}
                                    className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
                                  >
                                    {addingTrack[prompt.id] ? '...' : 'Drop it'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </section>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="mb-4 rounded-2xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
                      No prompts yet.
                    </p>
                  )}

                  {!playlist.is_revealed && (
                    <div className="mt-5 border-t border-[var(--border)] pt-4">
                      {showPromptFormFor === playlist.id ? (
                        <form onSubmit={(e) => addPrompt(e, playlist)} className="flex flex-col gap-2 sm:flex-row">
                          <input
                            type="text"
                            value={promptInputs[playlist.id] || ''}
                            onChange={(e) => setPromptInputs(prev => ({ ...prev, [playlist.id]: e.target.value }))}
                            placeholder="What kind of tracks are you looking for?"
                            autoFocus
                            className="flex-1 rounded-2xl bg-[var(--background)] border border-[var(--border)] px-4 py-3 text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] text-sm"
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={addingPrompt[playlist.id] || !promptInputs[playlist.id]?.trim()}
                              className="flex-1 rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                            >
                              {addingPrompt[playlist.id] ? 'Adding...' : 'Add'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowPromptFormFor(null)
                                setPromptInputs(prev => ({ ...prev, [playlist.id]: '' }))
                              }}
                              className="flex-1 rounded-2xl border border-[var(--border)] px-5 py-3 text-sm text-[var(--muted)] hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowPromptFormFor(playlist.id)}
                          className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-bold text-[var(--muted)] hover:border-white hover:text-white sm:w-auto"
                        >
                          + Add prompt
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <ConfirmModal
        isOpen={trackDeleteModal.isOpen}
        onClose={closeTrackDeleteModal}
        onConfirm={deleteTrack}
        title="Delete Track"
        message={`Delete "${trackDeleteModal.track?.name}"? This will also delete all guesses for this track.`}
        isDeleting={deleting}
      />

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        onConfirm={deletePlaylist}
        title="Delete Playlist"
        message={`Are you sure you want to delete "${deleteModal.playlist?.name}"? This will also delete all prompts, tracks, and guesses in this game.`}
        isDeleting={deleting}
      />
    </main>
  )
}
