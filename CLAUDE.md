# Record Pull

Anonymous collaborative playlist app built with Next.js and Supabase.

## Tech Stack
- Next.js 16 (App Router, JavaScript)
- Tailwind CSS
- Supabase (PostgreSQL)

## Database Schema
- `playlists` - id, name, slug, created_at
- `playlist_prompts` - id, playlist_id (FK), sort_order, description, created_at
- `playlist_tracks` - id, playlist_prompt_id (FK), name, created_at

Hierarchy: Playlist → Prompts → Tracks

## Project Structure
```
src/
  app/
    page.js          # Home - list/create playlists
    [slug]/page.js   # Playlist detail - prompts & tracks
    layout.js
    globals.css
  lib/
    supabase.js      # Supabase client
```

## Setup
1. Create Supabase project
2. Run `supabase-schema.sql` in SQL Editor
3. Copy `.env.local.example` to `.env.local` and add your Supabase credentials
4. `npm run dev`

## Design
Dark theme, NTS Radio-inspired aesthetic. Orange accent (#ff3d00).
