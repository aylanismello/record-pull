import assert from 'node:assert/strict'
import test from 'node:test'

import { collectPlaylistPlayers, isCorrectGuess, scorePlaylist } from '../src/lib/gameLogic.js'

const playlist = {
  playlist_prompts: [
    {
      playlist_tracks: [
        {
          id: 'track-1',
          submitter_name: 'Aylan',
          submitter_player_id: 'p1',
          track_votes: [
            { voter_name: 'Aylan', guessed_player_id: 'p1', voter_username: 'Karly', voter_player_id: 'p2' },
            { voter_name: 'Vanessa', guessed_player_id: 'p3', voter_username: 'Aylan', voter_player_id: 'p1' }
          ]
        },
        {
          id: 'track-2',
          submitter_name: 'Vanessa',
          submitter_player_id: 'p3',
          track_votes: [
            { voter_name: 'Vanessa', guessed_player_id: 'p3', voter_username: 'Karly', voter_player_id: 'p2' }
          ]
        }
      ]
    }
  ]
}

test('collectPlaylistPlayers returns stable registered game players', () => {
  assert.deepEqual(collectPlaylistPlayers(playlist), [
    { id: 'p1', name: 'Aylan' },
    { id: 'p2', name: 'Karly' },
    { id: 'p3', name: 'Vanessa' }
  ])
})

test('isCorrectGuess compares guessed player id to hidden submitter id', () => {
  assert.equal(isCorrectGuess(playlist.playlist_prompts[0].playlist_tracks[0].track_votes[0], playlist.playlist_prompts[0].playlist_tracks[0]), true)
  assert.equal(isCorrectGuess(playlist.playlist_prompts[0].playlist_tracks[0].track_votes[1], playlist.playlist_prompts[0].playlist_tracks[0]), false)
})

test('scorePlaylist counts correct guesses by voter', () => {
  assert.deepEqual(scorePlaylist(playlist), [
    { playerId: 'p2', name: 'Karly', correct: 2, total: 2 },
    { playerId: 'p1', name: 'Aylan', correct: 0, total: 1 }
  ])
})
