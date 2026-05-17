import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getVoteMarkers,
  makeUniqueDisplayName,
  renamePlayerReferences,
  shouldTreatVoteAsMine
} from '../src/lib/playerIdentity.js'

test('makeUniqueDisplayName keeps first player name unchanged', () => {
  assert.equal(makeUniqueDisplayName('Aylan', []), 'Aylan')
})

test('makeUniqueDisplayName suffixes duplicate names case-insensitively', () => {
  assert.equal(makeUniqueDisplayName(' ayLan ', ['Aylan']), 'ayLan 2')
  assert.equal(makeUniqueDisplayName('Aylan', ['Aylan', 'Aylan 2']), 'Aylan 3')
})

test('makeUniqueDisplayName ignores this player current name during rename', () => {
  assert.equal(makeUniqueDisplayName('Aylan', ['Aylan'], 'Aylan'), 'Aylan')
})

test('shouldTreatVoteAsMine uses player id instead of display name', () => {
  const vote = { voter_username: 'Aylan', voter_player_id: 'browser-2' }

  assert.equal(shouldTreatVoteAsMine(vote, { id: 'browser-1', displayName: 'Aylan' }), false)
  assert.equal(shouldTreatVoteAsMine(vote, { id: 'browser-2', displayName: 'Aylan 2' }), true)
})

test('renamePlayerReferences updates owned id-backed and legacy name-backed labels', () => {
  const playlists = [{
    playlist_prompts: [{
      playlist_tracks: [
        {
          id: 'track-1',
          submitter_name: 'Aylan',
          submitter_player_id: 'browser-1',
          track_votes: [
            { id: 'vote-1', voter_name: 'Aylan', voter_username: 'Aylan', voter_player_id: 'browser-1' },
            { id: 'vote-2', voter_name: 'Aylan', voter_username: 'Aylan', voter_player_id: 'browser-2' },
            { id: 'vote-3', voter_name: 'Aylan', guessed_player_id: 'browser-1', voter_username: 'Karly' },
            { id: 'vote-4', voter_name: 'Aylan', voter_username: 'Aylan' }
          ]
        },
        {
          id: 'legacy-track',
          submitter_name: 'Aylan',
          submitter_player_id: null,
          track_votes: []
        }
      ]
    }]
  }]

  assert.deepEqual(renamePlayerReferences(playlists, 'browser-1', 'Aylan New', 'Aylan'), {
    trackVoteIds: ['vote-1'],
    guessedVoteIds: ['vote-3'],
    trackIds: ['track-1'],
    legacyVoterVoteIds: ['vote-4'],
    legacyGuessedVoteIds: ['vote-4'],
    legacyTrackIds: ['legacy-track']
  })
})

test('getVoteMarkers highlights my guesses and guesses that point at me', () => {
  assert.deepEqual(
    getVoteMarkers(
      { voter_username: 'Aylan', voter_player_id: 'browser-1', voter_name: 'Karly', guessed_player_id: 'browser-2' },
      { id: 'browser-1', displayName: 'Aylan' }
    ),
    { isMine: true, isAboutMe: false }
  )

  assert.deepEqual(
    getVoteMarkers(
      { voter_username: 'Karly', voter_player_id: 'browser-2', voter_name: 'Aylan', guessed_player_id: 'browser-1' },
      { id: 'browser-1', displayName: 'Aylan' }
    ),
    { isMine: false, isAboutMe: true }
  )
})
