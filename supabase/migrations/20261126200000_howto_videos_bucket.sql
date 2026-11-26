-- How-to videos (founder 2026-11-26: "Pode criar no Supabase o espaço onde os vídeos vão ficar"; dt-council:
-- our own storage, never YouTube). A public bucket: anyone can read a video or the manifest by its public URL;
-- nobody writes through the API (no insert/update/delete policy), only the team with the service role.
-- No user data ever goes here: files are howto/<faq question id>/<variant>.mp4 and howto/manifest.json.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('howto', 'howto', true, 20971520, array['video/mp4', 'application/json'])
on conflict (id) do nothing;
