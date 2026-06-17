-- =====================================================================
-- Phase 4: Leader Presentation Mode
--
-- Adds persistent presentation state (zoom, rotation, pan, mode flag) to
-- the existing sessions table, plus a single RPC the leader uses to
-- update it. Ephemeral state (the live pointer position) is NOT stored
-- here — it is sent over Supabase broadcast on the existing
-- `session-<id>` channel to avoid DB writes at cursor frequency.
--
-- Backward compatibility:
--   • New columns have safe defaults (presentation_mode=false, zoom=1.0,
--     rotation=0, pan_x=0, pan_y=0), so existing sessions keep behaving
--     exactly as they do today.
--   • Existing RPCs (update_session_page, upsert_participant, …) are
--     untouched.
--   • Realtime publication already includes the sessions table, so the
--     new columns ride along automatically.
-- =====================================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS presentation_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zoom REAL NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS rotation INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pan_x REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pan_y REAL NOT NULL DEFAULT 0;

-- Sanity constraints (no-op if already satisfied; uses NOT VALID-free form
-- by referencing only the new columns).
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_zoom_range_chk;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_zoom_range_chk CHECK (zoom >= 0.25 AND zoom <= 5.0);

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_rotation_range_chk;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_rotation_range_chk CHECK (rotation IN (0, 90, 180, 270));

-- Leader-only RPC to update any subset of presentation fields atomically.
-- NULL means "leave unchanged", so the client can send single-field
-- updates (e.g. zoom only) without races.
CREATE OR REPLACE FUNCTION public.update_presentation_state(
  p_session_id UUID,
  p_user_id TEXT,
  p_presentation_mode BOOLEAN DEFAULT NULL,
  p_zoom REAL DEFAULT NULL,
  p_rotation INTEGER DEFAULT NULL,
  p_pan_x REAL DEFAULT NULL,
  p_pan_y REAL DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the session leader may change presentation state.
  UPDATE public.sessions
     SET presentation_mode = COALESCE(p_presentation_mode, presentation_mode),
         zoom              = COALESCE(p_zoom, zoom),
         rotation          = COALESCE(p_rotation, rotation),
         pan_x             = COALESCE(p_pan_x, pan_x),
         pan_y             = COALESCE(p_pan_y, pan_y),
         updated_at        = now()
   WHERE id = p_session_id
     AND leader_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_presentation_state(
  UUID, TEXT, BOOLEAN, REAL, INTEGER, REAL, REAL
) TO anon, authenticated;
