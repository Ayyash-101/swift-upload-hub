-- Tables
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  leader_id TEXT NOT NULL,
  book_name TEXT NOT NULL DEFAULT 'Untitled',
  pdf_url TEXT,
  current_page INTEGER NOT NULL DEFAULT 1,
  total_pages INTEGER NOT NULL DEFAULT 0,
  presentation_mode BOOLEAN NOT NULL DEFAULT false,
  zoom REAL NOT NULL DEFAULT 1.0,
  rotation INTEGER NOT NULL DEFAULT 0,
  pan_x REAL NOT NULL DEFAULT 0,
  pan_y REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sessions_zoom_range_chk CHECK (zoom >= 0.25 AND zoom <= 5.0),
  CONSTRAINT sessions_rotation_range_chk CHECK (rotation IN (0, 90, 180, 270))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO anon, authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read sessions" ON public.sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can create sessions" ON public.sessions FOR INSERT WITH CHECK (true);

CREATE TABLE public.participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  current_page INTEGER NOT NULL DEFAULT 1,
  is_leader BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO anon, authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read participants" ON public.participants FOR SELECT USING (true);
CREATE POLICY "Anyone can join" ON public.participants FOR INSERT WITH CHECK (true);

CREATE TABLE public.participant_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  participant_id text NOT NULL,
  current_page integer NOT NULL DEFAULT 1,
  reading_time_seconds integer NOT NULL DEFAULT 0,
  last_activity timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, participant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participant_progress TO anon, authenticated;
GRANT ALL ON public.participant_progress TO service_role;
ALTER TABLE public.participant_progress ENABLE ROW LEVEL SECURITY;
CREATE INDEX participant_progress_session_participant_idx ON public.participant_progress (session_id, participant_id);
CREATE POLICY "Read participant progress" ON public.participant_progress FOR SELECT USING (true);

CREATE TYPE public.page_message_type AS ENUM ('leader_note', 'discussion_message');

CREATE TABLE public.page_discussions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  participant_id text NOT NULL,
  participant_name text NOT NULL,
  content text NOT NULL,
  type public.page_message_type NOT NULL DEFAULT 'discussion_message',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_discussions TO anon, authenticated;
GRANT ALL ON public.page_discussions TO service_role;
ALTER TABLE public.page_discussions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read page discussions" ON public.page_discussions FOR SELECT USING (true);
CREATE INDEX page_discussions_session_page_idx ON public.page_discussions (session_id, page_number, created_at);

CREATE TABLE public.library_books (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  session_id uuid,
  title text NOT NULL DEFAULT 'كتاب',
  pdf_url text NOT NULL,
  local_cache_key text NOT NULL,
  total_pages integer NOT NULL DEFAULT 0,
  last_page integer NOT NULL DEFAULT 1,
  last_opened timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX library_books_user_cache_uidx ON public.library_books(user_id, local_cache_key);
CREATE INDEX library_books_user_idx ON public.library_books(user_id, last_opened DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_books TO anon, authenticated;
GRANT ALL ON public.library_books TO service_role;
ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read library books" ON public.library_books FOR SELECT USING (true);

ALTER TABLE public.sessions REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.page_discussions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.page_discussions;

-- Storage policies for pdfs bucket (bucket already created)
CREATE POLICY "Public read pdfs" ON storage.objects FOR SELECT USING (bucket_id = 'pdfs');
CREATE POLICY "Anyone upload pdfs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'pdfs');

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.update_session_page(p_session_id uuid, p_user_id text, p_page int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sessions SET current_page = p_page, updated_at = now()
   WHERE id = p_session_id AND leader_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.update_session_pdf(p_session_id uuid, p_user_id text, p_pdf_url text, p_book_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sessions SET pdf_url = p_pdf_url, book_name = p_book_name, current_page = 1, total_pages = 0, updated_at = now()
   WHERE id = p_session_id AND leader_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.set_session_total_pages(p_session_id uuid, p_user_id text, p_total int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sessions SET total_pages = p_total, updated_at = now()
   WHERE id = p_session_id AND leader_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_session(p_session_id uuid, p_user_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.sessions WHERE id = p_session_id AND leader_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_participant(p_session_id uuid, p_user_id text, p_name text, p_current_page int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_leader boolean;
BEGIN
  SELECT (leader_id = p_user_id) INTO v_is_leader FROM public.sessions WHERE id = p_session_id;
  IF v_is_leader IS NULL THEN RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.participants (session_id, user_id, name, is_leader, current_page, last_seen)
  VALUES (p_session_id, p_user_id, p_name, COALESCE(v_is_leader, false), COALESCE(p_current_page, 1), now())
  ON CONFLICT (session_id, user_id) DO UPDATE
    SET name = EXCLUDED.name, is_leader = EXCLUDED.is_leader,
        current_page = EXCLUDED.current_page, last_seen = now()
   WHERE public.participants.user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.participant_heartbeat(p_session_id uuid, p_user_id text, p_current_page int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.participants SET current_page = p_current_page, last_seen = now()
   WHERE session_id = p_session_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_progress(p_session_id uuid, p_user_id text, p_current_page int, p_reading_time_seconds int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.participant_progress (session_id, participant_id, current_page, reading_time_seconds, last_activity, updated_at)
  VALUES (p_session_id, p_user_id, p_current_page, GREATEST(p_reading_time_seconds, 0), now(), now())
  ON CONFLICT (session_id, participant_id) DO UPDATE
    SET current_page = EXCLUDED.current_page,
        reading_time_seconds = GREATEST(public.participant_progress.reading_time_seconds, EXCLUDED.reading_time_seconds),
        last_activity = now(), updated_at = now()
   WHERE public.participant_progress.participant_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_progress(p_session_id uuid, p_user_id text)
RETURNS TABLE (current_page int, reading_time_seconds int, last_activity timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT current_page, reading_time_seconds, last_activity FROM public.participant_progress
   WHERE session_id = p_session_id AND participant_id = p_user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.post_page_message(p_session_id uuid, p_page_number int, p_user_id text, p_user_name text, p_content text, p_is_leader_note boolean)
RETURNS public.page_discussions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_leader_id text; v_type public.page_message_type; v_row public.page_discussions;
BEGIN
  IF p_content IS NULL OR length(btrim(p_content)) = 0 THEN RAISE EXCEPTION 'Content required' USING ERRCODE = '22023'; END IF;
  SELECT leader_id INTO v_leader_id FROM public.sessions WHERE id = p_session_id;
  IF v_leader_id IS NULL THEN RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002'; END IF;
  IF p_is_leader_note AND v_leader_id = p_user_id THEN v_type := 'leader_note'; ELSE v_type := 'discussion_message'; END IF;
  INSERT INTO public.page_discussions (session_id, page_number, participant_id, participant_name, content, type)
  VALUES (p_session_id, p_page_number, p_user_id, p_user_name, btrim(p_content), v_type)
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.update_page_message(p_message_id uuid, p_user_id text, p_content text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_content IS NULL OR length(btrim(p_content)) = 0 THEN RAISE EXCEPTION 'Content required' USING ERRCODE = '22023'; END IF;
  UPDATE public.page_discussions SET content = btrim(p_content), updated_at = now()
   WHERE id = p_message_id AND participant_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_page_message(p_message_id uuid, p_user_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner text; v_session uuid; v_leader text;
BEGIN
  SELECT participant_id, session_id INTO v_owner, v_session FROM public.page_discussions WHERE id = p_message_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  SELECT leader_id INTO v_leader FROM public.sessions WHERE id = v_session;
  IF p_user_id <> v_owner AND p_user_id <> v_leader THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.page_discussions WHERE id = p_message_id;
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_library_book(p_user_id text, p_session_id uuid, p_title text, p_pdf_url text, p_local_cache_key text, p_total_pages integer, p_last_page integer)
RETURNS public.library_books LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.library_books;
BEGIN
  INSERT INTO public.library_books (user_id, session_id, title, pdf_url, local_cache_key, total_pages, last_page, last_opened)
  VALUES (p_user_id, p_session_id, COALESCE(NULLIF(btrim(p_title), ''), 'كتاب'), p_pdf_url, p_local_cache_key, GREATEST(COALESCE(p_total_pages, 0), 0), GREATEST(COALESCE(p_last_page, 1), 1), now())
  ON CONFLICT (user_id, local_cache_key) DO UPDATE
    SET session_id = COALESCE(EXCLUDED.session_id, public.library_books.session_id),
        title = EXCLUDED.title, pdf_url = EXCLUDED.pdf_url,
        total_pages = GREATEST(public.library_books.total_pages, EXCLUDED.total_pages),
        last_page = EXCLUDED.last_page, last_opened = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_library_book(p_user_id text, p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.library_books WHERE id = p_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_presentation_state(
  p_session_id UUID, p_user_id TEXT,
  p_presentation_mode BOOLEAN DEFAULT NULL, p_zoom REAL DEFAULT NULL,
  p_rotation INTEGER DEFAULT NULL, p_pan_x REAL DEFAULT NULL, p_pan_y REAL DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sessions
     SET presentation_mode = COALESCE(p_presentation_mode, presentation_mode),
         zoom = COALESCE(p_zoom, zoom),
         rotation = COALESCE(p_rotation, rotation),
         pan_x = COALESCE(p_pan_x, pan_x),
         pan_y = COALESCE(p_pan_y, pan_y),
         updated_at = now()
   WHERE id = p_session_id AND leader_id = p_user_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.update_session_page(uuid, text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_pdf(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_session_total_pages(uuid, text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_session(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_participant(uuid, text, text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_heartbeat(uuid, text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_progress(uuid, text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_progress(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_page_message(uuid, int, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_page_message(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_page_message(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_library_book(text, uuid, text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_library_book(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_presentation_state(UUID, TEXT, BOOLEAN, REAL, INTEGER, REAL, REAL) TO anon, authenticated;