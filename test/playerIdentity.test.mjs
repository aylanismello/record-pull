import assert from 'node:assert/strict'
import test from 'node:test'

import {
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

test('renamePlayerReferences updates every old vote label owned by this browser id', () => {
  const playlists = [{
    playlist_prompts: [{
      playlist_tracks: [{
        track_votes: [
          { id: 'vote-1', voter_name: 'Aylan', voter_username: 'Aylan', voter_player_id: 'browser-1' },
          { id: 'vote-2', voter_name: 'Aylan', voter_username: 'Aylan', voter_player_id: 'browser-2' }
        ]
      }]
    }]
  }]

  assert.deepEqual(renamePlayerReferences(playlists, 'browser-1', 'Aylan 2'), {
    trackVoteIds: ['vote-1'],
    trackIds: []
  })
})
