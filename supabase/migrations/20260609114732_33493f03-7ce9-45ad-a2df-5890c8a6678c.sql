
CREATE TABLE public.participant_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  participant_id text NOT NULL,
  current_page integer NOT NULL DEFAULT 1,
  reading_time_seconds integer NOT NULL DEFAULT 0,
  last_activity timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (session_id, participant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.participant_progress TO anon, authenticated;
GRANT ALL ON public.participant_progress TO service_role;

ALTER TABLE public.participant_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read progress" ON public.participant_progress FOR SELECT USING (true);
CREATE POLICY "Anyone can insert progress" ON public.participant_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update progress" ON public.participant_progress FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete progress" ON public.participant_progress FOR DELETE USING (true);

CREATE INDEX participant_progress_session_participant_idx
  ON public.participant_progress (session_id, participant_id);
