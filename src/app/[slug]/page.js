'use client'

import { useState, useEffect, use } from 'react'
import { supabase, supabaseConfigError } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ConfirmModal from '@/components/ConfirmModal'
import { EditIcon, TrashIcon } from '@/components/Icons'

export default function PlaylistPage({ params }) {
  const { slug } = use(params)
  const router = useRouter()
  const [playlist, setPlaylist] = useState(null)
  const [prompts, setPrompts] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showAddPrompt, setShowAddPrompt] = useState(false)
  const [newPromptDescription, setNewPromptDescription] = useState('')
  const [addingPrompt, setAddingPrompt] = useState(false)
  const [trackInputs, setTrackInputs] = useState({})
  const [addingTrack, setAddingTrack] = useState({})
  const [errorMessage, setErrorMessage] = useState(supabaseConfigError)

  // Edit states
  const [editingPlaylist, setEditingPlaylist] = useState(false)
  const [editPlaylistName, setEditPlaylistName] = useState('')
  const [updatingPlaylist, setUpdatingPlaylist] = useState(false)
  const [editingPromptId, setEditingPromptId] = useState(null)
  const [editPromptText, setEditPromptText] = useState('')
  const [updatingPrompt, setUpdatingPrompt] = useState(false)
  const [editingTrackId, setEditingTrackId] = useState(null)
  const [editTrackText, setEditTrackText] = useState('')
  const [updatingTrack, setUpdatingTrack] = useState(false)

  // Delete states
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, type: null, item: null })
  const [deleting, setDeleting] = useState(false)

  async function fetchPlaylist() {
    if (!supabase) {
      setLoading(false)
      return
    }

    // Get playlist by slug
    const { data: playlistData, error: playlistError } = await supabase
      .from('playlists')
      .select('*')
      .eq('slug', slug)
      .single()

    if (playlistError || !playlistData) {
      console.error('Failed to fetch playlist:', playlistError)
      setErrorMessage(playlistError?.message || 'Playlist not found.')
      setNotFound(true)
      setLoading(false)
      return
    }

    setPlaylist(playlistData)

    // Get prompts with their tracks
    const { data: promptsData, error: promptsError } = await supabase
      .from('playlist_prompts')
      .select(`
        *,
        playlist_tracks (*)
      `)
      .eq('playlist_id', playlistData.id)
      .order('sort_order', { ascending: true })

    if (promptsError) {
      console.error('Failed to fetch prompts:', promptsError)
      setErrorMessage(promptsError.message || 'Could not load prompts.')
      setPrompts([])
    } else {
      setErrorMessage(null)
      setPrompts(promptsData || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPlaylist()
  }, [slug])

  async function addPrompt(e) {
    e.preventDefault()
    if (!newPromptDescription.trim() || !playlist) return

    setAddingPrompt(true)

    const nextOrder = prompts.length > 0
      ? Math.max(...prompts.map(p => p.sort_order)) + 1
      : 0

    const { error } = await supabase
      .from('playlist_prompts')
      .insert([{
        playlist_id: playlist.id,
        description: newPromptDescription.trim(),
        sort_order: nextOrder
      }])

    if (error) {
      console.error('Failed to add prompt:', error)
      setErrorMessage(error.message || 'Could not add prompt.')
    } else {
      setErrorMessage(null)
      setNewPromptDescription('')
      setShowAddPrompt(false)
      fetchPlaylist()
    }
    setAddingPrompt(false)
  }

  async function addTrack(promptId) {
    const trackName = trackInputs[promptId]?.trim()
    if (!trackName) return

    setAddingTrack(prev => ({ ...prev, [promptId]: true }))

    const { error } = await supabase
      .from('playlist_tracks')
      .insert([{
        playlist_prompt_id: promptId,
        name: trackName
      }])

    if (error) {
      console.error('Failed to add track:', error)
      setErrorMessage(error.message || 'Could not add track.')
    } else {
      setErrorMessage(null)
      setTrackInputs(prev => ({ ...prev, [promptId]: '' }))
      fetchPlaylist()
    }
    setAddingTrack(prev => ({ ...prev, [promptId]: false }))
  }

  // Edit Playlist
  function startEditPlaylist() {
    setEditingPlaylist(true)
    setEditPlaylistName(playlist.name)
  }

  function cancelEditPlaylist() {
    setEditingPlaylist(false)
    setEditPlaylistName('')
  }

  async function updatePlaylist(e) {
    e.preventDefault()
    if (!editPlaylistName.trim()) return

    setUpdatingPlaylist(true)
    const { error } = await supabase
      .from('playlists')
      .update({ name: editPlaylistName.trim() })
      .eq('id', playlist.id)

    if (error) {
      console.error('Failed to update playlist:', error)
      setErrorMessage(error.message || 'Could not update playlist.')
    } else {
      setErrorMessage(null)
      setPlaylist({ ...playlist, name: editPlaylistName.trim() })
      cancelEditPlaylist()
    }
    setUpdatingPlaylist(false)
  }

  // Edit Prompt
  function startEditPrompt(prompt) {
    setEditingPromptId(prompt.id)
    setEditPromptText(prompt.description)
  }

  function cancelEditPrompt() {
    setEditingPromptId(null)
    setEditPromptText('')
  }

  async function updatePrompt(e, promptId) {
    e.preventDefault()
    if (!editPromptText.trim()) return

    setUpdatingPrompt(true)
    const { error } = await supabase
      .from('playlist_prompts')
      .update({ description: editPromptText.trim() })
      .eq('id', promptId)

    if (error) {
      console.error('Failed to update prompt:', error)
      setErrorMessage(error.message || 'Could not update prompt.')
    } else {
      setErrorMessage(null)
      cancelEditPrompt()
      fetchPlaylist()
    }
    setUpdatingPrompt(false)
  }

  // Edit Track
  function startEditTrack(track) {
    setEditingTrackId(track.id)
    setEditTrackText(track.name)
  }

  function cancelEditTrack() {
    setEditingTrackId(null)
    setEditTrackText('')
  }

  async function updateTrack(e, trackId) {
    e.preventDefault()
    if (!editTrackText.trim()) return

    setUpdatingTrack(true)
    const { error } = await supabase
      .from('playlist_tracks')
      .update({ name: editTrackText.trim() })
      .eq('id', trackId)

    if (error) {
      console.error('Failed to update track:', error)
      setErrorMessage(error.message || 'Could not update track.')
    } else {
      setErrorMessage(null)
      cancelEditTrack()
      fetchPlaylist()
    }
    setUpdatingTrack(false)
  }

  // Delete
  function openDeleteModal(type, item) {
    setDeleteModal({ isOpen: true, type, item })
  }

  function closeDeleteModal() {
    setDeleteModal({ isOpen: false, type: null, item: null })
  }

  async function handleDelete() {
    const { type, item } = deleteModal
    if (!item) return

    setDeleting(true)
    setErrorMessage(null)

    let error = null

    if (type === 'playlist') {
      const result = await supabase
        .from('playlists')
        .delete()
        .eq('id', item.id)
      error = result.error

      if (!error) {
        router.push('/')
        return
      }
    } else if (type === 'prompt') {
      const result = await supabase
        .from('playlist_prompts')
        .delete()
        .eq('id', item.id)
      error = result.error

      if (!error) {
        fetchPlaylist()
        closeDeleteModal()
      }
    } else if (type === 'track') {
      const result = await supabase
        .from('playlist_tracks')
        .delete()
        .eq('id', item.id)
      error = result.error

      if (!error) {
        fetchPlaylist()
        closeDeleteModal()
      }
    }

    if (error) {
      console.error(`Failed to delete ${type}:`, error)
      setErrorMessage(error.message || `Could not delete ${type}.`)
    }

    setDeleting(false)
  }

  function getDeleteMessage() {
    const { type, item } = deleteModal
    if (type === 'playlist') {
      return `Are you sure you want to delete "${item?.name}"? This will also delete all prompts and tracks.`
    } else if (type === 'prompt') {
      return `Are you sure you want to delete this prompt? This will also delete all tracks submitted to it.`
    } else if (type === 'track') {
      return `Are you sure you want to delete "${item?.name}"?`
    }
    return ''
  }

  if (loading) {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
        <div className="text-[var(--muted)]">Loading...</div>
      </main>
    )
  }

  if (notFound) {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4">Playlist not found</h1>
        <Link href="/" className="text-[var(--accent)] hover:underline">
          Back to all playlists
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      <Link
        href="/"
        className="text-[var(--muted)] hover:text-white transition-colors text-sm mb-6 sm:mb-8 inline-block"
      >
        &larr; All playlists
      </Link>

      <header className="mb-8 sm:mb-10 md:mb-12">
        {editingPlaylist ? (
          <form onSubmit={updatePlaylist} className="mb-4">
            <input
              type="text"
              value={editPlaylistName}
              onChange={(e) => setEditPlaylistName(e.target.value)}
              className="w-full px-4 py-3 mb-3 bg-[var(--card)] border border-[var(--border)] text-white text-3xl sm:text-4xl md:text-5xl font-bold placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={updatingPlaylist || !editPlaylistName.trim()}
                className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {updatingPlaylist ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={cancelEditPlaylist}
                className="px-4 py-2 border border-[var(--border)] text-[var(--muted)] hover:text-white transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-2">{playlist.name}</h1>
            <p className="text-[var(--muted)] text-sm mb-3">/{playlist.slug}</p>
            <div className="flex gap-2">
              <button
                onClick={startEditPlaylist}
                className="p-2.5 sm:p-2 border border-[var(--border)] text-[var(--muted)] hover:text-white transition-colors"
                aria-label="Edit playlist"
              >
                <EditIcon className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={() => openDeleteModal('playlist', playlist)}
                className="p-2.5 sm:p-2 border border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                aria-label="Delete playlist"
              >
                <TrashIcon className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </>
        )}
      </header>

      {errorMessage && (
        <div className="mb-6 border border-[var(--accent)] bg-[var(--accent)]/10 px-4 py-3 text-sm text-white">
          <span className="font-medium">Database error:</span> {errorMessage}
        </div>
      )}

      <div className="mb-6 sm:mb-8">
        {!showAddPrompt ? (
          <button
            onClick={() => setShowAddPrompt(true)}
            className="w-full sm:w-auto px-5 py-2 border border-[var(--border)] text-[var(--muted)] hover:text-white hover:border-white transition-colors text-sm"
          >
            + Add Prompt
          </button>
        ) : (
          <form onSubmit={addPrompt} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <input
              type="text"
              value={newPromptDescription}
              onChange={(e) => setNewPromptDescription(e.target.value)}
              placeholder="What kind of tracks are you looking for?"
              autoFocus
              className="flex-1 px-4 py-3 bg-[var(--card)] border border-[var(--border)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="flex gap-3 sm:gap-4">
              <button
                type="submit"
                disabled={addingPrompt || !newPromptDescription.trim()}
                className="flex-1 sm:flex-none px-6 py-3 bg-[var(--accent)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {addingPrompt ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddPrompt(false); setNewPromptDescription('') }}
                className="flex-1 sm:flex-none px-6 py-3 border border-[var(--border)] text-[var(--muted)] hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {prompts.length === 0 ? (
        <div className="text-[var(--muted)] text-center py-12 sm:py-16 border border-dashed border-[var(--border)]">
          No prompts yet. Add one to start collecting tracks.
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {prompts.map((prompt, index) => (
            <div
              key={prompt.id}
              className="bg-[var(--card)] border border-[var(--border)] p-4 sm:p-6"
            >
              {editingPromptId === prompt.id ? (
                <form onSubmit={(e) => updatePrompt(e, prompt.id)} className="mb-4 sm:mb-6">
                  <div className="flex items-start gap-3 sm:gap-4 mb-3">
                    <span className="text-[var(--accent)] font-mono text-sm mt-2">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <input
                      type="text"
                      value={editPromptText}
                      onChange={(e) => setEditPromptText(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2 ml-6 sm:ml-10">
                    <button
                      type="submit"
                      disabled={updatingPrompt || !editPromptText.trim()}
                      className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {updatingPrompt ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditPrompt}
                      className="px-4 py-2 border border-[var(--border)] text-[var(--muted)] hover:text-white transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-start gap-3 sm:gap-4 mb-3">
                    <span className="text-[var(--accent)] font-mono text-sm">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h2 className="text-lg sm:text-xl font-medium flex-1">
                      {prompt.description}
                    </h2>
                  </div>
                  <div className="flex gap-2 mb-4 sm:mb-6 ml-6 sm:ml-10">
                    <button
                      onClick={() => startEditPrompt(prompt)}
                      className="p-2 sm:p-1.5 border border-[var(--border)] text-[var(--muted)] hover:text-white transition-colors"
                      aria-label="Edit prompt"
                    >
                      <EditIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </button>
                    <button
                      onClick={() => openDeleteModal('prompt', prompt)}
                      className="p-2 sm:p-1.5 border border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                      aria-label="Delete prompt"
                    >
                      <TrashIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </button>
                  </div>
                </>
              )}

              {/* Tracks */}
              {prompt.playlist_tracks && prompt.playlist_tracks.length > 0 && (
                <div className="mb-4 sm:mb-6 ml-6 sm:ml-10 space-y-2">
                  {prompt.playlist_tracks.map((track) => (
                    editingTrackId === track.id ? (
                      <form key={track.id} onSubmit={(e) => updateTrack(e, track.id)} className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={editTrackText}
                          onChange={(e) => setEditTrackText(e.target.value)}
                          className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] text-sm"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={updatingTrack || !editTrackText.trim()}
                            className="px-3 py-1 bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {updatingTrack ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditTrack}
                            className="px-3 py-1 border border-[var(--border)] text-[var(--muted)] hover:text-white transition-colors text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div
                        key={track.id}
                        className="py-2 px-3 bg-[var(--background)] border-l-2 border-[var(--accent)] text-sm flex items-center justify-between gap-3 group"
                      >
                        <span className="flex-1">{track.name}</span>
                        <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEditTrack(track)}
                            className="p-1.5 sm:p-1 text-[var(--muted)] hover:text-white transition-colors"
                            aria-label="Edit track"
                          >
                            <EditIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                          </button>
                          <button
                            onClick={() => openDeleteModal('track', track)}
                            className="p-1.5 sm:p-1 text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                            aria-label="Delete track"
                          >
                            <TrashIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* Add track input */}
              <div className="ml-6 sm:ml-10 flex flex-col sm:flex-row gap-2 sm:gap-3">
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
                  onClick={() => addTrack(prompt.id)}
                  disabled={addingTrack[prompt.id] || !trackInputs[prompt.id]?.trim()}
                  className="w-full sm:w-auto px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {addingTrack[prompt.id] ? '...' : 'Submit'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDelete}
        title={`Delete ${deleteModal.type === 'playlist' ? 'Playlist' : deleteModal.type === 'prompt' ? 'Prompt' : 'Track'}`}
        message={getDeleteMessage()}
        isDeleting={deleting}
      />
    </main>
  )
}
