
CREATE POLICY "Public read pdfs" ON storage.objects FOR SELECT USING (bucket_id = 'pdfs');
CREATE POLICY "Anyone upload pdfs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'pdfs');
