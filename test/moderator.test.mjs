import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canDeletePlaylist,
  canDeleteTrack,
  canDeleteVote,
  MODERATOR_CODE,
  normalizeModeratorCode,
  validateModeratorCode
} from '../src/lib/moderator.js'

test('validateModeratorCode accepts the shared moderator code with spacing', () => {
  assert.equal(MODERATOR_CODE, '6969')
  assert.equal(validateModeratorCode('6969'), true)
  assert.equal(validateModeratorCode(' 69 69 '), true)
})

test('validateModeratorCode rejects wrong or empty values', () => {
  assert.equal(validateModeratorCode('69'), false)
  assert.equal(validateModeratorCode('nice'), false)
  assert.equal(validateModeratorCode(''), false)
})

test('normalizeModeratorCode keeps only digits', () => {
  assert.equal(normalizeModeratorCode(' 69-69 '), '6969')
})

test('moderator grants delete permissions', () => {
  assert.equal(canDeletePlaylist({ isModerator: false }), false)
  assert.equal(canDeleteTrack({ isModerator: true }), true)
  assert.equal(canDeleteVote({ isModerator: true }), true)
})
