-- =====================================================================
-- MIGRATION 003 - Seguranca (RLS) e permissoes
-- Ativa a protecao por linha em TODAS as tabelas e NAO cria nenhuma regra publica.
-- Resultado: ninguem acessa os dados pela internet usando a chave publica (anon).
-- Somente o bot, usando a chave SECRETA (service_role), consegue ler e gravar.
-- =====================================================================
alter table public.professores          enable row level security;
alter table public.administradores      enable row level security;
alter table public.contadores_protocolo enable row level security;
alter table public.chamados             enable row level security;
alter table public.historico_chamados   enable row level security;
alter table public.conversas            enable row level security;
alter table public.mensagens            enable row level security;
alter table public.erros                enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

revoke all on function public.criar_chamado(uuid,text,text,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.criar_chamado(uuid,text,text,text,text,text,boolean,text) to service_role;
