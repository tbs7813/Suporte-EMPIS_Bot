-- =====================================================================
-- MIGRATION 002 - Funcao que cria o chamado e gera o protocolo
-- (tudo numa unica operacao, entao dois chamados nunca recebem o mesmo numero)
-- =====================================================================
create or replace function public.criar_chamado(
  p_professor_id uuid,
  p_categoria    text,
  p_equipamento  text,
  p_descricao    text,
  p_local        text,
  p_urgencia     text,
  p_humano       boolean,
  p_chave        text
) returns public.chamados
language plpgsql as $$
declare
  v_ano int := extract(year from (now() at time zone 'America/Sao_Paulo'))::int;
  v_num int;
  v_row public.chamados;
begin
  -- Se ja existe chamado criado pela mesma mensagem, devolve o mesmo (sem duplicar)
  if p_chave is not null then
    select * into v_row from public.chamados where chave_idempotencia = p_chave;
    if found then return v_row; end if;
  end if;

  insert into public.contadores_protocolo (ano, ultimo) values (v_ano, 1)
  on conflict (ano) do update set ultimo = public.contadores_protocolo.ultimo + 1
  returning ultimo into v_num;

  insert into public.chamados
    (protocolo, professor_id, categoria, equipamento, descricao, local, urgencia, humano, chave_idempotencia)
  values
    ('EMPIS-' || v_ano || '-' || lpad(v_num::text, 5, '0'),
     p_professor_id, p_categoria, p_equipamento, p_descricao, p_local,
     coalesce(p_urgencia, 'nao_impede'), coalesce(p_humano, false), p_chave)
  returning * into v_row;

  insert into public.historico_chamados (chamado_id, tipo, texto, autor)
  values (v_row.id,
          case when v_row.humano then 'atendimento_humano' else 'abertura' end,
          case when v_row.humano then 'Professor pediu para falar com o tecnico' else 'Chamado aberto pelo professor' end,
          'professor');

  return v_row;
end $$;
