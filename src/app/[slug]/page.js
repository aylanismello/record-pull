'use client'

import { useCallback, useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase, supabaseConfigError } from '@/lib/supabase'
import { MODERATOR_COOKIE, canDeletePlaylist, canDeleteTrack, canDeleteVote, validateModeratorCode } from '@/lib/moderator'
import { collectPlaylistPlayers, isCorrectGuess, playerOptionsForTrack, scorePlaylist } from '@/lib/gameLogic'
import {
  PLAYER_ID_COOKIE,
  collectPlayerNames,
  createPlayerId,
  getVoteMarkers,
  makeUniqueDisplayName,
  normalizePlayerName,
  readCookie,
  shouldTreatVoteAsMine,
  writeCookie
} from '@/lib/playerIdentity'

export default function RecordPullPage({ params }) {
  const { slug } = use(params)
  const playerNameCookie = `record_pull_${slug}_player_name`
  const [recordPull, setRecordPull] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState(supabaseConfigError)
  const [playerId, setPlayerId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [playerNameDraft, setPlayerNameDraft] = useState('')
  const [trackInputs, setTrackInputs] = useState({})
  const [voteInputs, setVoteInputs] = useState({})
  const [addingTrack, setAddingTrack] = useState({})
  const [addingVote, setAddingVote] = useState({})
  const [expandedPrompts, setExpandedPrompts] = useState({})
  const [revealed, setRevealed] = useState(false)
  const [isModerator, setIsModerator] = useState(false)
  const [moderatorCode, setModeratorCode] = useState('')

  const fetchRecordPull = useCallback(async function fetchRecordPull() {
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
      .eq('slug', slug)
      .single()

    if (error || !data) {
      console.error('Failed to fetch record pull:', error)
      setErrorMessage(error?.message || 'Record pull not found.')
      setNotFound(true)
    } else {
      setErrorMessage(null)
      setRecordPull({
        ...data,
        playlist_prompts: (data.playlist_prompts || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      })
    }
    setLoading(false)
  }, [slug])

  useEffect(() => {
    let savedId = readCookie(PLAYER_ID_COOKIE)
    if (!savedId) {
      savedId = createPlayerId()
      writeCookie(PLAYER_ID_COOKIE, savedId)
    }
    const savedName = readCookie(playerNameCookie)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayerId(savedId)
     
    setIsModerator(readCookie(MODERATOR_COOKIE) === 'true')
    if (savedName) {
       
      setPlayerName(savedName)
       
      setPlayerNameDraft(savedName)
    }
     
    fetchRecordPull()

    if (!supabase) return undefined
    const channel = supabase
      .channel(`record-pull-${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlists' }, fetchRecordPull)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_prompts' }, fetchRecordPull)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_tracks' }, fetchRecordPull)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'track_votes' }, fetchRecordPull)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [slug, fetchRecordPull, playerNameCookie])

  async function savePlayerName(e) {
    e.preventDefault()
    const requestedName = playerNameDraft.trim()
    if (!requestedName || !playerId || !recordPull) return
    const uniqueName = makeUniqueDisplayName(requestedName, collectPlayerNames([recordPull]), playerName)
    writeCookie(playerNameCookie, uniqueName)
    setPlayerName(uniqueName)
    setPlayerNameDraft(uniqueName)
    if (uniqueName !== requestedName) setErrorMessage(`${requestedName} was taken in this record pull, so you are ${uniqueName}.`)
  }

  async function addTrack(promptId) {
    const name = trackInputs[promptId]?.trim()
    if (!name || !playerName || !playerId || !supabase) {
      setErrorMessage('Pick your game name before adding tracks.')
      return
    }
    setAddingTrack(prev => ({ ...prev, [promptId]: true }))
    const { error } = await supabase.from('playlist_tracks').insert([{
      playlist_prompt_id: promptId,
      name,
      submitter_name: playerName,
      submitter_player_id: playerId
    }])
    if (error) setErrorMessage(error.message || 'Could not add track.')
    else {
      setTrackInputs(prev => ({ ...prev, [promptId]: '' }))
      fetchRecordPull()
    }
    setAddingTrack(prev => ({ ...prev, [promptId]: false }))
  }

  async function addVote(track, maxVotes) {
    const pickedName = voteInputs[track.id]
    if (!pickedName || !playerName || !playerId || !recordPull || !supabase) return
    if (track.track_votes?.some(vote => shouldTreatVoteAsMine(vote, { id: playerId, displayName: playerName }))) return
    if ((track.track_votes?.length || 0) >= maxVotes) return
    if (normalizePlayerName(pickedName) === normalizePlayerName(playerName)) return

    const guessed = collectPlaylistPlayers(recordPull).find(player => player.name === pickedName)
    setAddingVote(prev => ({ ...prev, [track.id]: true }))
    const { error } = await supabase.from('track_votes').insert([{
      track_id: track.id,
      voter_name: pickedName,
      voter_username: playerName,
      voter_player_id: playerId,
      guessed_player_id: guessed?.id || null
    }])
    if (error) setErrorMessage(error.message || 'Could not add guess.')
    else {
      setVoteInputs(prev => ({ ...prev, [track.id]: '' }))
      fetchRecordPull()
    }
    setAddingVote(prev => ({ ...prev, [track.id]: false }))
  }

  async function deleteVote(voteId) {
    if (!supabase || !canDeleteVote({ isModerator })) return
    await supabase.from('track_votes').delete().eq('id', voteId)
    fetchRecordPull()
  }

  async function deleteTrack(trackId) {
    if (!supabase || !canDeleteTrack({ isModerator })) return
    await supabase.from('playlist_tracks').delete().eq('id', trackId)
    fetchRecordPull()
  }

  async function deleteRecordPull() {
    if (!supabase || !recordPull || !canDeletePlaylist({ isModerator })) return
    await supabase.from('playlists').delete().eq('id', recordPull.id)
    window.location.href = '/'
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
  }

  if (loading) return <main className="min-h-screen p-5 max-w-3xl mx-auto text-[var(--muted)]">Loading…</main>
  if (notFound) return <main className="min-h-screen p-5 max-w-3xl mx-auto"><h1 className="text-3xl font-black">Record pull not found</h1><Link href="/" className="text-[var(--accent)]">Back to lobby</Link></main>

  const scores = scorePlaylist(recordPull)

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 md:px-8 max-w-3xl mx-auto">
      <Link href="/" className="mb-4 inline-block text-sm font-bold text-[var(--muted)]">← lobby</Link>

      <header className="mb-5 rounded-[2rem] bg-white/[0.06] p-5 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        <div className="mb-3 inline-flex rounded-full bg-[var(--accent)]/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">record pull</div>
        <h1 className="text-4xl font-black tracking-tight">{recordPull.name}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">/{recordPull.slug}</p>
      </header>

      <section className="mb-4 rounded-[1.5rem] bg-white/[0.055] p-4 ring-1 ring-white/10">
        <form onSubmit={savePlayerName} className="flex gap-2">
          <input value={playerNameDraft} onChange={(e) => setPlayerNameDraft(e.target.value)} placeholder="Your name in this record pull" className="min-w-0 flex-1 rounded-full bg-black/40 px-4 py-3 text-white ring-1 ring-white/10 focus:outline-none focus:ring-[var(--accent)]" />
          <button disabled={!playerNameDraft.trim() || playerNameDraft.trim() === playerName} className="rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-black text-black disabled:opacity-50">{playerName ? 'Save' : 'Join'}</button>
        </form>
      </section>

      <section className="mb-5 rounded-[1.5rem] bg-white/[0.055] p-4 ring-1 ring-white/10">
        {isModerator ? (
          <div className="space-y-3">
            <button onClick={() => setRevealed(prev => !prev)} className="w-full rounded-full bg-white px-5 py-3 text-sm font-black uppercase tracking-wide text-black">{revealed ? 'Hide answers' : 'Reveal answers'}</button>
            {revealed && <div className="space-y-2">{scores.length ? scores.map(score => <div key={score.playerId || score.name} className="flex justify-between rounded-2xl bg-black/25 px-3 py-2 text-sm"><b>{score.name}</b><span className="text-[var(--muted)]">{score.correct}/{score.total} right</span></div>) : <p className="text-sm text-[var(--muted)]">No guesses yet.</p>}</div>}
            <button onClick={deleteRecordPull} className="w-full rounded-full border border-[var(--accent-hot)]/40 px-5 py-3 text-sm font-black text-[var(--accent-hot)]">Delete record pull</button>
          </div>
        ) : (
          <form onSubmit={unlockModerator} className="flex gap-2">
            <input value={moderatorCode} onChange={(e) => setModeratorCode(e.target.value)} type="password" inputMode="numeric" placeholder="Mod code" className="min-w-0 flex-1 rounded-full bg-black/40 px-4 py-3 text-white ring-1 ring-white/10" />
            <button className="rounded-full bg-white px-4 py-3 text-sm font-black text-black">Mod</button>
          </form>
        )}
      </section>

      {errorMessage && <div className="mb-4 rounded-2xl bg-[var(--accent-hot)]/15 p-4 text-sm text-white ring-1 ring-[var(--accent-hot)]/40">{errorMessage}</div>}

      <div className="space-y-3">
        {(recordPull.playlist_prompts || []).map((prompt, index) => {
          const expanded = expandedPrompts[prompt.id] === true
          const tracks = prompt.playlist_tracks || []
          const guesses = tracks.reduce((sum, track) => sum + (track.track_votes?.length || 0), 0)
          return (
            <section key={prompt.id} className="overflow-hidden rounded-[1.5rem] bg-white/[0.06] ring-1 ring-white/10">
              <button onClick={() => setExpandedPrompts(prev => ({ ...prev, [prompt.id]: !prev[prompt.id] }))} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">round {String(index + 1).padStart(2, '0')}</div>
                  <h2 className="mt-1 text-lg font-black text-white">{prompt.description}</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">{tracks.length} tracks · {guesses} guesses</p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{expanded ? 'Hide' : 'Open'}</span>
              </button>

              {expanded && (
                <div className="space-y-3 border-t border-white/10 p-3">
                  {tracks.map(track => {
                    const maxVotes = Math.max(tracks.length - 1, 0)
                    const votes = track.track_votes || []
                    const currentPlayer = { id: playerId, displayName: playerName }
                    const options = playerOptionsForTrack(recordPull, track, playerId)
                    const alreadyVoted = playerName && votes.some(vote => shouldTreatVoteAsMine(vote, currentPlayer))
                    const votingDisabled = !playerName || revealed || maxVotes === 0 || alreadyVoted || votes.length >= maxVotes || options.length === 0
                    return (
                      <div key={track.id} className="rounded-[1.25rem] bg-black/30 p-4 ring-1 ring-white/10">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-black text-white">{track.name}</div>
                            {revealed && <div className="mt-1 inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-black text-black">picked by {track.submitter_name || 'unknown'}</div>}
                          </div>
                          {isModerator && <button onClick={() => deleteTrack(track.id)} className="rounded-full px-3 py-1 text-xs font-black text-[var(--accent-hot)]">Delete</button>}
                        </div>

                        {votes.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{votes.map(vote => {
                          const markers = getVoteMarkers(vote, currentPlayer)
                          const correct = isCorrectGuess(vote, track)
                          return <span key={vote.id} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${revealed && correct ? 'bg-[var(--accent)] text-black' : 'bg-white/10 text-white'}`}>{revealed && (correct ? '✓' : '×')} {vote.voter_name}<span className="opacity-60">← {vote.voter_username}</span>{markers.isMine && !revealed && <span className="text-[var(--accent)]">you</span>}{isModerator && <button onClick={() => deleteVote(vote.id)}>×</button>}</span>
                        })}</div>}

                        {!revealed && (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <select value={voteInputs[track.id] || ''} onChange={(e) => setVoteInputs(prev => ({ ...prev, [track.id]: e.target.value }))} disabled={votingDisabled} className="flex-1 rounded-full bg-[var(--card)] px-4 py-3 text-white ring-1 ring-white/10 disabled:opacity-50">
                              <option value="">{!playerName ? 'Join first' : alreadyVoted ? 'You guessed this one' : 'Pick a player'}</option>
                              {options.map(option => <option key={option.id || option.name} value={option.name}>{option.name}</option>)}
                            </select>
                            <button onClick={() => addVote(track, maxVotes)} disabled={addingVote[track.id] || votingDisabled || !voteInputs[track.id]} className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-black text-black disabled:opacity-50">Guess</button>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {!revealed && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input value={trackInputs[prompt.id] || ''} onChange={(e) => setTrackInputs(prev => ({ ...prev, [prompt.id]: e.target.value }))} placeholder="Add your track…" className="flex-1 rounded-full bg-black/40 px-4 py-3 text-white ring-1 ring-white/10 focus:outline-none focus:ring-[var(--accent)]" />
                      <button onClick={() => addTrack(prompt.id)} disabled={addingTrack[prompt.id] || !trackInputs[prompt.id]?.trim()} className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-black text-black disabled:opacity-50">Submit</button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}
