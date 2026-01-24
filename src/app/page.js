'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
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

  useEffect(() => {
    fetchPlaylists()
  }, [])

  async function fetchPlaylists() {
    const { data, error } = await supabase
      .from('playlists')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) {
      setPlaylists(data || [])
    }
    setLoading(false)
  }

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
    if (!newName.trim()) return

    setCreating(true)
    const slug = await generateSlug()

    const { error } = await supabase
      .from('playlists')
      .insert([{ name: newName.trim(), slug }])

    if (!error) {
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

    if (!error) {
      cancelEdit()
      fetchPlaylists()
    }
    setUpdating(false)
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
                <Link href={`/${playlist.slug}`} className="block mb-3">
                  <h2 className="text-xl sm:text-2xl font-medium group-hover:text-[var(--accent)] transition-colors">
                    {playlist.name}
                  </h2>
                  <p className="text-[var(--muted)] text-sm mt-1">
                    /{playlist.slug}
                  </p>
                </Link>
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
