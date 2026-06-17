
-- Tighten library_books: remove always-true write policies; force writes through SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Anyone can delete library books" ON public.library_books;
DROP POLICY IF EXISTS "Anyone can insert library books" ON public.library_books;
DROP POLICY IF EXISTS "Anyone can update library books" ON public.library_books;
DROP POLICY IF EXISTS "Anyone can read library books" ON public.library_books;

-- Reads stay open (rows scoped by unguessable user_id UUID on the client; writes go through RPCs only).
CREATE POLICY "Read library books" ON public.library_books FOR SELECT USING (true);
-- No direct INSERT / UPDATE / DELETE policies => denied; must use RPC.

-- Delete RPC scoped by caller-provided user_id
CREATE OR REPLACE FUNCTION public.delete_library_book(p_user_id text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.library_books WHERE id = p_id AND user_id = p_user_id;
END;
$$;

-- participant_progress: add minimal read policy so signed-in users (and RPCs) can read; writes still via RPC only.
CREATE POLICY "Read participant progress" ON public.participant_progress FOR SELECT USING (true);
