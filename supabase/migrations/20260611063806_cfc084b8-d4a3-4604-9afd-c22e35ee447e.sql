
-- 1. Drop overly permissive write policies
DROP POLICY IF EXISTS "Leader can update session" ON public.sessions;
DROP POLICY IF EXISTS "Leader can delete session" ON public.sessions;
DROP POLICY IF EXISTS "Anyone can update participant" ON public.participants;
DROP POLICY IF EXISTS "Anyone can leave" ON public.participants;
DROP POLICY IF EXISTS "Anyone can insert progress" ON public.participant_progress;
DROP POLICY IF EXISTS "Anyone can update progress" ON public.participant_progress;
DROP POLICY IF EXISTS "Anyone can delete progress" ON public.participant_progress;
DROP POLICY IF EXISTS "Anyone can read progress" ON public.participant_progress;

-- Block all direct writes; SECURITY DEFINER RPCs handle authorized writes.
-- (Read remains allowed on sessions and participants via existing SELECT policies.)
-- participant_progress: no public read either — go through RPC.

-- 2. SECURITY DEFINER helper functions for ownership-checked writes.
--    The owner identifier is the random per-device UUID stored client-side.

CREATE OR REPLACE FUNCTION public.update_session_page(
  p_session_id uuid, p_user_id text, p_page int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sessions
     SET current_page = p_page, updated_at = now()
   WHERE id = p_session_id AND leader_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_session_pdf(
  p_session_id uuid, p_user_id text, p_pdf_url text, p_book_name text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sessions
     SET pdf_url = p_pdf_url,
         book_name = p_book_name,
         current_page = 1,
         total_pages = 0,
         updated_at = now()
   WHERE id = p_session_id AND leader_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_session_total_pages(
  p_session_id uuid, p_user_id text, p_total int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sessions
     SET total_pages = p_total, updated_at = now()
   WHERE id = p_session_id AND leader_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_session(
  p_session_id uuid, p_user_id text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.sessions
   WHERE id = p_session_id AND leader_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_participant(
  p_session_id uuid, p_user_id text, p_name text, p_current_page int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_leader boolean;
BEGIN
  -- Derive is_leader from sessions; ignore any client-supplied value
  SELECT (leader_id = p_user_id) INTO v_is_leader
    FROM public.sessions WHERE id = p_session_id;
  IF v_is_leader IS NULL THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.participants (session_id, user_id, name, is_leader, current_page, last_seen)
  VALUES (p_session_id, p_user_id, p_name, COALESCE(v_is_leader, false), COALESCE(p_current_page, 1), now())
  ON CONFLICT (session_id, user_id) DO UPDATE
    SET name = EXCLUDED.name,
        is_leader = EXCLUDED.is_leader,
        current_page = EXCLUDED.current_page,
        last_seen = now()
   WHERE public.participants.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.participant_heartbeat(
  p_session_id uuid, p_user_id text, p_current_page int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.participants
     SET current_page = p_current_page,
         last_seen = now()
   WHERE session_id = p_session_id AND user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_progress(
  p_session_id uuid, p_user_id text, p_current_page int, p_reading_time_seconds int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.participant_progress
    (session_id, participant_id, current_page, reading_time_seconds, last_activity, updated_at)
  VALUES (p_session_id, p_user_id, p_current_page, GREATEST(p_reading_time_seconds, 0), now(), now())
  ON CONFLICT (session_id, participant_id) DO UPDATE
    SET current_page = EXCLUDED.current_page,
        reading_time_seconds = GREATEST(public.participant_progress.reading_time_seconds, EXCLUDED.reading_time_seconds),
        last_activity = now(),
        updated_at = now()
   WHERE public.participant_progress.participant_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_progress(
  p_session_id uuid, p_user_id text
) RETURNS TABLE (current_page int, reading_time_seconds int, last_activity timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT current_page, reading_time_seconds, last_activity
    FROM public.participant_progress
   WHERE session_id = p_session_id AND participant_id = p_user_id
   LIMIT 1;
$$;

-- 3. Grant EXECUTE so anonymous clients can call the RPCs
GRANT EXECUTE ON FUNCTION public.update_session_page(uuid, text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_pdf(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_session_total_pages(uuid, text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_session(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_participant(uuid, text, text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_heartbeat(uuid, text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_progress(uuid, text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_progress(uuid, text) TO anon, authenticated;
