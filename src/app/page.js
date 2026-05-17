'use client'

import { useState, useEffect } from 'react'
import { supabase, supabaseConfigError } from '@/lib/supabase'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'
import { EditIcon, TrashIcon } from '@/components/Icons'

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
    if (!name || !supabase) return

    setAddingTrack(prev => ({ ...prev, [promptId]: true }))
    setErrorMessage(null)

    const { error } = await supabase
      .from('playlist_tracks')
      .insert([{
        playlist_prompt_id: promptId,
        name
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
    const voterName = voteInputs[track.id]?.trim()
    if (!voterName || !supabase) return

    const currentVotes = track.track_votes?.length || 0
    if (currentVotes >= maxVotes) {
      setErrorMessage(`This track already has the max ${maxVotes} vote${maxVotes === 1 ? '' : 's'}.`)
      return
    }

    setAddingVote(prev => ({ ...prev, [track.id]: true }))
    setErrorMessage(null)

    const { error } = await supabase
      .from('track_votes')
      .insert([{
        track_id: track.id,
        voter_name: voterName
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

  async function deleteVote(voteId) {
    if (!supabase) return

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

    if (!error) {
      fetchPlaylists()
      closeDeleteModal()
    }
    setDeleting(false)
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      <header className="mb-8 sm:mb-12 md:mb-16">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-2">Record Pull</h1>
        <p className="text-[var(--muted)] text-base sm:text-lg">Anonymous collaborative playlists</p>
      </header>

      <div className="mb-6 sm:mb-8">
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full sm:w-auto px-6 py-3 bg-[var(--accent)] text-white font-medium hover:opacity-90 transition-opacity"
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
                className="p-4 sm:p-6 bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors group"
              >
                <Link href={`/${playlist.slug}`} className="block mb-4">
                  <h2 className="text-xl sm:text-2xl font-medium group-hover:text-[var(--accent)] transition-colors">
                    {playlist.name}
                  </h2>
                  <p className="text-[var(--muted)] text-sm mt-1">
                    /{playlist.slug}
                  </p>
                </Link>

                {playlist.playlist_prompts?.length > 0 ? (
                  <div className="mb-4 space-y-4 border-t border-[var(--border)] pt-4">
                    {playlist.playlist_prompts.map((prompt, index) => (
                      <div key={prompt.id}>
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
                                  const maxVotes = prompt.playlist_tracks.length
                                  const votes = track.track_votes || []
                                  const voteLimitReached = votes.length >= maxVotes

                                  return (
                                    <div
                                      key={track.id}
                                      className="border-l-4 border-[var(--accent)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--muted)]"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1 text-base font-medium text-white break-words">
                                          {track.name}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => openTrackDeleteModal(track)}
                                          className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                                          aria-label={`Delete track ${track.name}`}
                                        >
                                          Delete
                                        </button>
                                      </div>

                                      <div className="mt-3">
                                        <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-wide text-[var(--muted)]">
                                          <span>Who picked it?</span>
                                          <span>{votes.length}/{maxVotes} votes</span>
                                        </div>

                                        {votes.length > 0 && (
                                          <div className="mb-3 flex flex-wrap gap-2">
                                            {votes.map((vote) => (
                                              <span
                                                key={vote.id}
                                                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs text-white"
                                              >
                                                <span>{vote.voter_name}</span>
                                                <button
                                                  type="button"
                                                  onClick={() => deleteVote(vote.id)}
                                                  className="text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                                                  aria-label={`Delete vote for ${vote.voter_name}`}
                                                >
                                                  ×
                                                </button>
                                              </span>
                                            ))}
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
                                            placeholder={voteLimitReached ? 'Vote limit reached' : 'Vote for a person...'}
                                            disabled={voteLimitReached}
                                            className="flex-1 px-3 py-2 bg-[var(--card)] border border-[var(--border)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 text-sm"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => addVote(track, maxVotes)}
                                            disabled={addingVote[track.id] || voteLimitReached || !voteInputs[track.id]?.trim()}
                                            className="w-full sm:w-auto px-4 py-2 border border-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent)] transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                                          >
                                            {addingVote[track.id] ? 'Voting...' : 'Vote'}
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

                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(playlist)}
                    className="p-2.5 sm:p-2 border border-[var(--border)] text-[var(--muted)] hover:text-white transition-colors"
                    aria-label="Edit playlist"
                  >
                    <EditIcon className="w-5 h-5 sm:w-4 sm:h-4" />
                  </button>
                  <button
                    onClick={() => openDeleteModal(playlist)}
                    className="p-2.5 sm:p-2 border border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                    aria-label="Delete playlist"
                  >
                    <TrashIcon className="w-5 h-5 sm:w-4 sm:h-4" />
                  </button>
                </div>
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
