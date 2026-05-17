export const MODERATOR_CODE = '6969'
export const MODERATOR_COOKIE = 'record_pull_moderator'

export function normalizeModeratorCode(code) {
  return String(code || '').replace(/\D/g, '')
}

export function validateModeratorCode(code) {
  return normalizeModeratorCode(code) === MODERATOR_CODE
}

export function canDeletePlaylist(user) {
  return Boolean(user?.isModerator)
}

export function canDeleteTrack(user) {
  return Boolean(user?.isModerator)
}

export function canDeleteVote(user) {
  return Boolean(user?.isModerator)
}
