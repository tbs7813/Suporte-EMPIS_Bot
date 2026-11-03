-- =====================================================================
-- CADASTRO DOS TECNICOS AUTORIZADOS
-- 1) Edite os nomes e telefones abaixo.
-- 2) Formato do telefone: so numeros, com 55 + DDD + numero (com o 9). Ex.: 5531999998888
-- 3) Rode no SQL Editor do Supabase.
-- Para remover um tecnico: update public.administradores set ativo = false where telefone = '5531999998888';
-- =====================================================================
insert into public.administradores (nome, telefone) values
  ('Nome do Tecnico', '5531999998888');
