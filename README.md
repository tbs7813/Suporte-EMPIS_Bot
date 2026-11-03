# EMPIS Suporte Bot

Chatbot de suporte técnico da Escola Municipal Professora Isaura Santos (EMPIS) pelo **WhatsApp Cloud API oficial da Meta**.
Sem painel, sem site, sem IA: menus e regras. Roda na nuvem (Cloudflare Workers) com banco no Supabase (PostgreSQL).

## O que ele faz
- Atende professores automaticamente (menu numérico 1 a 9) e cadastra o professor pelo telefone.
- Registra chamados (categoria, equipamento, descrição, local, urgência), gera protocolo `EMPIS-ANO-00001`.
- Consulta chamados, busca por protocolo, acrescenta informações. Um professor nunca vê chamado de outro.
- Atendimento humano: pausa o bot na conversa e avisa o técnico.
- O técnico controla tudo pelo próprio WhatsApp (`/chamados`, `/assumir`, `/responder`, `/resolver`...).
- Guarda mensagens, chamados e histórico no banco. Protege contra mensagens duplicadas e valida a assinatura da Meta.

## Por onde começar
1. Leia **docs/GUIA-PASSO-A-PASSO.md** (do zero até o bot funcionando).
2. Use **docs/CHECKLIST-TESTES-REAIS.md** para conferir tudo.
3. Técnicos: **docs/COMANDOS-TECNICO.md**.
4. Manutenção, backup, limites do plano grátis e LGPD: **docs/MANUTENCAO.md**.
5. WhatsApp não oficial temporário (Evolution API): teste no seu computador em **docs/TESTE-LOCAL.md** e deploy na Railway em **docs/EVOLUTION-RAILWAY.md**.
   O provedor é escolhido pelo segredo `WA_PROVIDER` (`meta` ou `evolution`).

## Estrutura
```
src/index.js       entrada do Worker (webhook + tarefa diária)
src/bot.js         menus, passos da conversa e comandos do técnico
src/texts.js       todos os textos do bot (edite aqui para mudar mensagens)
src/whatsapp.js    envio de mensagens e validação da assinatura da Meta
src/api-wpp/       provedores de WhatsApp: port (validação), adapters Meta e Evolution, fábrica
src/db.js          acesso ao Supabase
supabase/migrations/   scripts SQL (rodar na ordem 001, 002, 003)
supabase/seed_administradores.sql   cadastro dos técnicos
test/              testes automáticos da lógica (npm test)
wrangler.toml      configuração da Cloudflare
.env.example       modelo dos segredos (sem valores reais)
.github/workflows/backup-semanal.yml   backup semanal (opcional)
```
