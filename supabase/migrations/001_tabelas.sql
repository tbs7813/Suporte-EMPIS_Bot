-- =====================================================================
-- MIGRATION 001 - Tabelas, relacionamentos, restricoes e indices
-- Execute no Supabase: SQL Editor > New query > cole tudo > Run
-- =====================================================================

-- Professores (identificados pelo telefone)
create table public.professores (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null check (char_length(nome) between 5 and 80),
  telefone         text not null unique check (telefone ~ '^[0-9]{10,15}$'),
  consentimento_em timestamptz not null default now(),   -- LGPD: quando aceitou o uso dos dados
  criado_em        timestamptz not null default now()
);

-- Numeros autorizados a usar comandos de tecnico
create table public.administradores (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  telefone  text not null unique check (telefone ~ '^[0-9]{10,15}$'),
  wa_id     text,                                  -- formato recebido da Meta (preenchido sozinho)
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Contador para gerar protocolos sem repeticao (um por ano)
create table public.contadores_protocolo (
  ano    integer primary key,
  ultimo integer not null default 0
);

-- Chamados
create table public.chamados (
  id                 uuid primary key default gen_random_uuid(),
  protocolo          text not null unique check (protocolo ~ '^EMPIS-[0-9]{4}-[0-9]{5}$'),
  professor_id       uuid not null references public.professores(id) on delete restrict,
  categoria          text not null,
  equipamento        text,
  descricao          text not null check (char_length(descricao) <= 2000),
  local              text,
  urgencia           text not null default 'nao_impede'
                     check (urgencia in ('impede_atividade','nao_impede')),
  status             text not null default 'aberto'
                     check (status in ('aberto','em_atendimento','resolvido','cancelado')),
  humano             boolean not null default false,  -- true = professor pediu para falar com o tecnico
  tecnico_telefone   text,
  chave_idempotencia text unique,                     -- evita chamado duplicado
  aberto_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  concluido_em       timestamptz
);
create index chamados_professor_idx on public.chamados (professor_id, aberto_em desc);
create index chamados_status_idx    on public.chamados (status, aberto_em);
create index chamados_humano_idx    on public.chamados (professor_id) where humano and status in ('aberto','em_atendimento');

-- Historico de cada chamado (mudancas de status, respostas, informacoes extras)
create table public.historico_chamados (
  id         uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  tipo       text not null check (tipo in ('abertura','status','resposta_tecnico','resposta_nao_entregue','info_complementar','atendimento_humano','nota')),
  texto      text not null,
  autor      text not null,               -- 'professor', 'sistema' ou telefone do tecnico
  criado_em  timestamptz not null default now()
);
create index historico_chamado_idx on public.historico_chamados (chamado_id, criado_em);

-- Estado da conversa de cada telefone (para o bot lembrar em que passo parou)
create table public.conversas (
  telefone      text primary key,
  wa_id         text,
  estado        text not null default 'INICIO',
  dados         jsonb not null default '{}'::jsonb,
  bot_pausado   boolean not null default false,   -- true = atendimento humano
  atualizado_em timestamptz not null default now()
);

-- Todas as mensagens (entrada e saida)
create table public.mensagens (
  id           uuid primary key default gen_random_uuid(),
  wamid        text unique,                       -- ID da mensagem na Meta (impede duplicidade)
  direcao      text not null check (direcao in ('entrada','saida')),
  remetente    text not null,
  destinatario text not null,
  conteudo     text,
  tipo         text not null default 'text',
  protocolo    text,
  chamado_id   uuid references public.chamados(id) on delete set null,
  enviada      boolean not null default true,
  criado_em    timestamptz not null default now()
);
create index mensagens_remetente_idx    on public.mensagens (remetente, criado_em desc);
create index mensagens_destinatario_idx on public.mensagens (destinatario, criado_em desc);
create index mensagens_protocolo_idx    on public.mensagens (protocolo) where protocolo is not null;

-- Registro de erros do bot
create table public.erros (
  id        uuid primary key default gen_random_uuid(),
  origem    text not null,
  mensagem  text not null,
  detalhe   jsonb,
  criado_em timestamptz not null default now()
);

-- Atualiza "atualizado_em" do chamado automaticamente
create or replace function public.tg_atualiza_chamado() returns trigger
language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

create trigger chamados_atualizado before update on public.chamados
for each row execute function public.tg_atualiza_chamado();
