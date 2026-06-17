
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

-- App uses anonymous text user_id (not auth.uid()); access is open like other tables in this project.
CREATE POLICY "Anyone can read library books" ON public.library_books FOR SELECT USING (true);
CREATE POLICY "Anyone can insert library books" ON public.library_books FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update library books" ON public.library_books FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete library books" ON public.library_books FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.upsert_library_book(
  p_user_id text,
  p_session_id uuid,
  p_title text,
  p_pdf_url text,
  p_local_cache_key text,
  p_total_pages integer,
  p_last_page integer
) RETURNS public.library_books
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.library_books;
BEGIN
  INSERT INTO public.library_books
    (user_id, session_id, title, pdf_url, local_cache_key, total_pages, last_page, last_opened)
  VALUES
    (p_user_id, p_session_id, COALESCE(NULLIF(btrim(p_title), ''), 'كتاب'),
     p_pdf_url, p_local_cache_key, GREATEST(COALESCE(p_total_pages, 0), 0),
     GREATEST(COALESCE(p_last_page, 1), 1), now())
  ON CONFLICT (user_id, local_cache_key) DO UPDATE
    SET session_id = COALESCE(EXCLUDED.session_id, public.library_books.session_id),
        title = EXCLUDED.title,
        pdf_url = EXCLUDED.pdf_url,
        total_pages = GREATEST(public.library_books.total_pages, EXCLUDED.total_pages),
        last_page = EXCLUDED.last_page,
        last_opened = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
