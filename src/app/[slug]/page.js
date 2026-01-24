'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function PlaylistPage({ params }) {
  const { slug } = use(params)
  const [playlist, setPlaylist] = useState(null)
  const [prompts, setPrompts] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showAddPrompt, setShowAddPrompt] = useState(false)
  const [newPromptDescription, setNewPromptDescription] = useState('')
  const [addingPrompt, setAddingPrompt] = useState(false)
  const [trackInputs, setTrackInputs] = useState({})
  const [addingTrack, setAddingTrack] = useState({})

  useEffect(() => {
    fetchPlaylist()
  }, [slug])

  async function fetchPlaylist() {
    // Get playlist by slug
    const { data: playlistData, error: playlistError } = await supabase
      .from('playlists')
      .select('*')
      .eq('slug', slug)
      .single()

    if (playlistError || !playlistData) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setPlaylist(playlistData)

    // Get prompts with their tracks
    const { data: promptsData } = await supabase
      .from('playlist_prompts')
      .select(`
        *,
        playlist_tracks (*)
      `)
      .eq('playlist_id', playlistData.id)
      .order('sort_order', { ascending: true })

    setPrompts(promptsData || [])
    setLoading(false)
  }

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

    if (!error) {
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

    if (!error) {
      setTrackInputs(prev => ({ ...prev, [promptId]: '' }))
      fetchPlaylist()
    }
    setAddingTrack(prev => ({ ...prev, [promptId]: false }))
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
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-2">{playlist.name}</h1>
        <p className="text-[var(--muted)] text-sm">/{playlist.slug}</p>
      </header>

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
              <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
                <span className="text-[var(--accent)] font-mono text-sm">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h2 className="text-lg sm:text-xl font-medium flex-1">
                  {prompt.description}
                </h2>
              </div>

              {/* Tracks */}
              {prompt.playlist_tracks && prompt.playlist_tracks.length > 0 && (
                <div className="mb-4 sm:mb-6 ml-6 sm:ml-10 space-y-2">
                  {prompt.playlist_tracks.map((track) => (
                    <div
                      key={track.id}
                      className="py-2 px-3 bg-[var(--background)] border-l-2 border-[var(--accent)] text-sm"
                    >
                      {track.name}
                    </div>
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
    </main>
  )
}
