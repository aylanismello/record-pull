-- Record Pull Database Schema
-- Run this in your Supabase SQL Editor

-- Playlists table
CREATE TABLE playlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Playlist prompts table
CREATE TABLE playlist_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Playlist tracks table (songs submitted to prompts)
CREATE TABLE playlist_tracks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_prompt_id UUID NOT NULL REFERENCES playlist_prompts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  submitter_name TEXT,
  submitter_player_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track votes table (people who may have selected a track)
CREATE TABLE track_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES playlist_tracks(id) ON DELETE CASCADE,
  voter_name TEXT NOT NULL, -- who the player thinks picked the anonymous track
  voter_username TEXT, -- display name of who cast this guess
  voter_player_id TEXT, -- stable browser identity of who cast this guess
  guessed_player_id TEXT, -- stable browser identity of the guessed player when known
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_playlist_prompts_playlist_id ON playlist_prompts(playlist_id);
CREATE INDEX idx_playlist_prompts_sort_order ON playlist_prompts(playlist_id, sort_order);
CREATE INDEX idx_playlist_tracks_prompt_id ON playlist_tracks(playlist_prompt_id);
CREATE INDEX idx_playlist_tracks_submitter_player_id ON playlist_tracks(submitter_player_id);
CREATE INDEX idx_track_votes_track_id ON track_votes(track_id);
CREATE INDEX idx_track_votes_voter_username ON track_votes(voter_username);
CREATE INDEX idx_track_votes_voter_player_id ON track_votes(voter_player_id);
CREATE INDEX idx_track_votes_guessed_player_id ON track_votes(guessed_player_id);

-- Enable Row Level Security (but allow all operations since it's anonymous)
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_votes ENABLE ROW LEVEL SECURITY;

-- Policies for anonymous access
CREATE POLICY "Allow all operations on playlists" ON playlists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on playlist_prompts" ON playlist_prompts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on playlist_tracks" ON playlist_tracks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on track_votes" ON track_votes FOR ALL USING (true) WITH CHECK (true);
