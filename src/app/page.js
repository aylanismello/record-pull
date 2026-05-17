'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'
import { supabase, supabaseConfigError } from '@/lib/supabase'
import { MODERATOR_COOKIE, canDeletePlaylist, validateModeratorCode } from '@/lib/moderator'
import { readCookie, writeCookie } from '@/lib/playerIdentity'

const snobPhrases = [
  'before-they-sold-out', 'vinyl-only', 'you-wouldnt-get-it', 'cassette-rip', 'bootleg-edition',
  'limited-press', 'import-only', 'deep-cut', 'unreleased-demo', 'college-radio', 'actually-good',
  'ironically-good', 'secret-show', 'diy-venue', 'euro-import', 'too-obscure', 'raw-mix',
  'lo-fi-aesthetic', 'boutique-label', 'heard-it-first', 'underground-classic', 'reissue-when',
  'white-label', 'test-pressing', 'rare-groove', 'only-on-bandcamp', 'soundcloud-era',
  'never-remastered', 'original-lineup', 'pre-hiatus'
]

export default function Home() {
  const [recordPulls, setRecordPulls] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState(supabaseConfigError)
  const [moderatorCode, setModeratorCode] = useState('')
  const [isModerator, setIsModerator] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, recordPull: null })
  const [deleting, setDeleting] = useState(false)

  const fetchRecordPulls = useCallback(async function fetchRecordPulls() {
    if (!supabase) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('playlists')
      .select(`
        *,
        playlist_prompts (
          id,
          playlist_tracks (
            id,
            track_votes (id)
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch record pulls:', error)
      setErrorMessage(error.message || 'Could not load record pulls.')
    } else {
      setErrorMessage(null)
      setRecordPulls(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsModerator(readCookie(MODERATOR_COOKIE) === 'true')
     
    fetchRecordPulls()

    if (!supabase) return undefined

    const channel = supabase
      .channel('record-pulls-lobby')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlists' }, fetchRecordPulls)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_prompts' }, fetchRecordPulls)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_tracks' }, fetchRecordPulls)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'track_votes' }, fetchRecordPulls)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchRecordPulls])

  async function generateSlug() {
    const shuffled = [...snobPhrases].sort(() => Math.random() - 0.5)
    for (const phrase of shuffled) {
      const { data } = await supabase.from('playlists').select('id').eq('slug', phrase).maybeSingle()
      if (!data) return phrase
    }
    return `${snobPhrases[0]}-${Date.now().toString(36)}`
  }

  async function createRecordPull(e) {
    e.preventDefault()
    if (!newName.trim() || !supabase) return
    setCreating(true)
    setErrorMessage(null)

    const slug = await generateSlug()
    const { error } = await supabase.from('playlists').insert([{ name: newName.trim(), slug }])

    if (error) {
      console.error('Failed to create record pull:', error)
      setErrorMessage(error.message || 'Could not create record pull.')
    } else {
      setNewName('')
      setShowCreate(false)
      fetchRecordPulls()
    }
    setCreating(false)
  }

  function unlockModerator(e) {
    e.preventDefault()
    if (!validateModeratorCode(moderatorCode)) {
      setErrorMessage('Wrong moderator code.')
      return
    }
    setIsModerator(true)
    writeCookie(MODERATOR_COOKIE, 'true')
    setModeratorCode('')
    setErrorMessage(null)
  }

  function lockModerator() {
    setIsModerator(false)
    writeCookie(MODERATOR_COOKIE, 'false')
  }

  async function deleteRecordPull() {
    if (!deleteModal.recordPull || !canDeletePlaylist({ isModerator }) || !supabase) return
    setDeleting(true)
    const { error } = await supabase.from('playlists').delete().eq('id', deleteModal.recordPull.id)
    if (error) {
      console.error('Failed to delete record pull:', error)
      setErrorMessage(error.message || 'Could not delete record pull.')
    } else {
      setDeleteModal({ isOpen: false, recordPull: null })
      fetchRecordPulls()
    }
    setDeleting(false)
  }

  function counts(recordPull) {
    const prompts = recordPull.playlist_prompts || []
    const tracks = prompts.flatMap(prompt => prompt.playlist_tracks || [])
    const guesses = tracks.flatMap(track => track.track_votes || [])
    return { prompts: prompts.length, tracks: tracks.length, guesses: guesses.length }
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 md:px-8 max-w-3xl mx-auto">
      <header className="mb-6 rounded-[2rem] bg-white/[0.06] p-5 shadow-2xl ring-1 ring-white/10 backdrop-blur sm:p-7">
        <div className="mb-3 inline-flex rounded-full bg-[var(--accent)]/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">record pull lobby</div>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Record Pull</h1>
        <p className="mt-3 text-base leading-7 text-[var(--muted)]">Each card is a live record pull. Share its link and players land directly inside that game — not this admin-ish overview.</p>
      </header>

      <section className="mb-5 rounded-[1.5rem] bg-white/[0.055] p-4 ring-1 ring-white/10">
        {isModerator ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">mod mode</div>
              <div className="text-sm text-[var(--muted)]">create and remove record pulls</div>
            </div>
            <button type="button" onClick={lockModerator} className="rounded-full bg-white px-4 py-2 text-sm font-black text-black">Lock</button>
          </div>
        ) : (
          <form onSubmit={unlockModerator} className="flex gap-2">
            <input value={moderatorCode} onChange={(e) => setModeratorCode(e.target.value)} inputMode="numeric" type="password" placeholder="Mod code" className="min-w-0 flex-1 rounded-full bg-black/40 px-4 py-3 text-white ring-1 ring-white/10 focus:outline-none focus:ring-[var(--accent)]" />
            <button className="rounded-full bg-white px-4 py-3 text-sm font-black text-black">Unlock</button>
          </form>
        )}
      </section>

      {errorMessage && (
        <div className="mb-5 rounded-2xl bg-[var(--accent-hot)]/15 p-4 text-sm text-white ring-1 ring-[var(--accent-hot)]/40">{errorMessage}</div>
      )}

      {isModerator && (
        <div className="mb-5">
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} className="w-full rounded-full bg-[var(--accent)] px-6 py-4 text-sm font-black uppercase tracking-wide text-black shadow-lg">New Record Pull</button>
          ) : (
            <form onSubmit={createRecordPull} className="rounded-[1.5rem] bg-white/[0.055] p-3 ring-1 ring-white/10">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Record pull name..." autoFocus className="mb-3 w-full rounded-2xl bg-black/40 px-4 py-3 text-white ring-1 ring-white/10 focus:outline-none focus:ring-[var(--accent)]" />
              <div className="grid grid-cols-2 gap-2">
                <button disabled={creating || !newName.trim()} className="rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-black text-black disabled:opacity-50">{creating ? 'Creating...' : 'Create'}</button>
                <button type="button" onClick={() => { setShowCreate(false); setNewName('') }} className="rounded-full bg-white/10 px-4 py-3 text-sm font-black text-white">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-[var(--muted)]">Loading…</div>
      ) : recordPulls.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-white/15 p-8 text-center text-[var(--muted)]">No record pulls yet.</div>
      ) : (
        <div className="space-y-3">
          {recordPulls.map(recordPull => {
            const c = counts(recordPull)
            return (
              <div key={recordPull.id} className="rounded-[1.75rem] bg-white/[0.065] p-4 shadow-xl ring-1 ring-white/10 transition hover:ring-[var(--accent)]/60">
                <Link href={`/${recordPull.slug}`} className="block">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-2xl font-black tracking-tight text-white">{recordPull.name}</h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">/{recordPull.slug}</p>
                    </div>
                    <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-black text-black">Open</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-2xl bg-black/25 p-3"><div className="text-lg font-black text-white">{c.prompts}</div><div className="text-[var(--muted)]">rounds</div></div>
                    <div className="rounded-2xl bg-black/25 p-3"><div className="text-lg font-black text-white">{c.tracks}</div><div className="text-[var(--muted)]">tracks</div></div>
                    <div className="rounded-2xl bg-black/25 p-3"><div className="text-lg font-black text-white">{c.guesses}</div><div className="text-[var(--muted)]">guesses</div></div>
                  </div>
                </Link>
                {isModerator && (
                  <button type="button" onClick={() => setDeleteModal({ isOpen: true, recordPull })} className="mt-3 w-full rounded-full border border-white/10 px-4 py-3 text-sm font-black text-[var(--muted)] hover:border-[var(--accent-hot)] hover:text-[var(--accent-hot)]">Delete record pull</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, recordPull: null })}
        onConfirm={deleteRecordPull}
        title="Delete Record Pull"
        message={`Delete "${deleteModal.recordPull?.name}"? This also deletes rounds, tracks, and guesses.`}
        isDeleting={deleting}
      />
    </main>
  )
}
