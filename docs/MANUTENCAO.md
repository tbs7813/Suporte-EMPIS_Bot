# Manutenção, backup, limites e LGPD

## Limites do plano gratuito (verificados em novembro/2026; confirme nos sites, pois mudam)

| Serviço | Limite que importa | O que fazer |
|---|---|---|
| Cloudflare Workers | 100.000 requisições/dia; 10 ms de CPU por requisição | Uma escola não chega perto. Se chegar, o bot para até 00:00 UTC. |
| Supabase | 500 MB de banco; **pausa após 7 dias sem atividade**; **sem backup automático** | Tarefa diária no Worker + backup (abaixo). |
| GitHub | Repositório privado grátis | Mantenha privado. |
| Meta | Texto dentro de 24 h da mensagem do professor é grátis | O bot não envia mensagens fora da janela. |

Se o Supabase pausar: entre em supabase.com > seu projeto > **Restore project**. Os dados não são apagados.
A tarefa diária do bot reduz muito esse risco, mas não é garantia absoluta (a regra é do Supabase e pode mudar).

## Backup

O plano grátis não faz backup. Opções:

1. **Manual (mais simples), uma vez por mês:** Supabase > **Table Editor** > escolha a tabela > menu **Export** > CSV.
   Faça para `professores`, `chamados`, `historico_chamados` e `mensagens`. Guarde os arquivos em local seguro (contêm dados pessoais).
2. **Automático semanal (GitHub Actions):** o arquivo `.github/workflows/backup-semanal.yml` gera um backup **criptografado** e guarda por 90 dias.
   Para ativar, no repositório GitHub (privado): Settings > Secrets and variables > Actions > New repository secret:
   - `SUPABASE_DB_URL`: no Supabase, botão **Connect** > *Session pooler* (compatível com IPv4) > copie a string e troque `[YOUR-PASSWORD]` pela senha do banco.
   - `BACKUP_PASSPHRASE`: uma senha forte inventada por você (guarde-a: sem ela o backup não abre).
   Depois: aba **Actions** > "Backup semanal do banco" > **Run workflow** para testar.
   *Este fluxo não foi testado por mim. Se falhar, me envie a mensagem de erro (sem senhas).*
3. Plano pago do Supabase (Pro, cerca de US$ 25/mês) inclui backups diários. Só considere se a escola decidir que o bot é crítico.

## Atualizar o bot

`npm test` e `npx wrangler deploy` (veja o guia, Parte 6). Os dados ficam no Supabase e não são afetados.
Mudanças no banco entram como novos arquivos `supabase/migrations/004_....sql`, rodados no SQL Editor.

## Ver erros

- Tabela `erros` no Supabase (erros ao processar mensagens).
- `npx wrangler tail` mostra o que o bot faz em tempo real.

## Trocar um técnico

Supabase > SQL Editor:

```sql
update public.administradores set ativo = false where telefone = '5531999998888';
insert into public.administradores (nome, telefone) values ('Novo Técnico', '5531977776666');
```

## Trocar segredos (token vencido ou suspeita de vazamento)

`npx wrangler secret put NOME` com o novo valor.
Em caso de vazamento: gere novo token na Meta, novo App Secret, e uma nova chave no Supabase (Project Settings > API) e atualize todos os segredos.

## LGPD: apagar os dados de um professor (a pedido dele)

Substitua o telefone (55 + DDD + número com 9) e rode no SQL Editor:

```sql
delete from public.mensagens where remetente = '5531988887777' or destinatario = '5531988887777';
delete from public.conversas where telefone = '5531988887777';
delete from public.chamados where professor_id = (select id from public.professores where telefone = '5531988887777');
delete from public.professores where telefone = '5531988887777';
```

Isso apaga também o histórico dos chamados dele. Decida com a direção/prefeitura antes, pois pode haver obrigação de guardar registros.

## Pontos conhecidos (limitações)

- Se o professor enviar duas mensagens em menos de 1 segundo, a segunda pode ser lida antes de a primeira terminar de ser gravada. É raro; se o bot não entender, ele pede para repetir.
- Só mensagens de texto são entendidas (áudio, imagem e figurinha recebem um aviso).
- Chamado encerrado não é reaberto: o professor abre um novo.
- Avisos do bot ao técnico (chamado novo) só chegam se o técnico escreveu ao número nas últimas 24 h (regra do WhatsApp).
- A API da Meta evolui. Se aparecer aviso de versão antiga, altere `GRAPH_VERSION` no `wrangler.toml` e faça deploy.
- Não foi possível testar daqui a conexão real com Meta, Supabase e Cloudflare (o ambiente não tem internet). Os testes automáticos cobrem a lógica com serviços simulados; os testes reais são os do `CHECKLIST-TESTES-REAIS.md`.
