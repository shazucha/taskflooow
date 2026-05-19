-- Unique indexy potrebné pre ON CONFLICT upsert v chat_reads a direct_message_reads.
-- project_id môže byť NULL (tímový chat), preto dva čiastočné indexy.

create unique index if not exists chat_reads_user_scope_project_uidx
  on public.chat_reads (user_id, scope, project_id)
  where project_id is not null;

create unique index if not exists chat_reads_user_scope_team_uidx
  on public.chat_reads (user_id, scope)
  where project_id is null;

create unique index if not exists direct_message_reads_user_peer_uidx
  on public.direct_message_reads (user_id, peer_id);