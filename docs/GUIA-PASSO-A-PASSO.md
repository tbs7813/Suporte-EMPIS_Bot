# Guia passo a passo — do zero ao bot funcionando (custo R$ 0,00)

> **Regras de ouro**
> 1. **Nunca** cole tokens, chaves ou senhas em conversas, e-mails ou repositórios públicos (nem comigo).
> 2. Faça na ordem. Só passe para a parte seguinte quando a atual estiver funcionando.
> 3. Os nomes de menus da Meta, Supabase e Cloudflare mudam de vez em quando. Se não achar algo, procure o item mais parecido ou me mande um print (cobrindo tokens e chaves).
> 4. **NÃO mexa no número real do TI até a Parte 8.** Tudo antes disso usa o número de TESTE da Meta e não afeta nada.

Tempo estimado: 1h30 a 2h30 na primeira vez.

---
## Parte 0 — O que você vai precisar
- Um computador (Windows, Mac ou Linux) com internet. Só para instalar; depois o bot roda sozinho na nuvem.
- Um e-mail seu (use o mesmo e-mail nos serviços para não se perder).
- Um celular com WhatsApp para testar (será o "professor") e, se possível, um segundo para o "técnico".
- Um **gerenciador de senhas** ou um caderno seguro para anotar as chaves que vão aparecer.

### Instalar o Node.js (uma vez)
1. Acesse **nodejs.org** e baixe a versão **LTS**. Instale clicando em "Avançar" até o fim.
2. Para conferir, abra o terminal (veja abaixo) e digite `node --version`. Deve aparecer algo como `v22.x.x`.

### O que é o "terminal" e como abrir na pasta do projeto
O terminal é uma janela onde você digita comandos. Cada comando deste guia é digitado nele e confirmado com **Enter**.
1. Descompacte o ZIP `empis-suporte-bot.zip` (botão direito > Extrair tudo). Vai surgir a pasta `empis-suporte-bot`.
2. **Windows:** abra a pasta no Explorador de Arquivos, clique na barra de endereço (onde aparece o caminho), apague o texto, digite `cmd` e tecle Enter. Abre uma janela preta já na pasta certa.
   **Mac:** clique com o botão direito na pasta > "Novo Terminal na Pasta".
3. Se no Windows aparecer erro mencionando "scripts desabilitados" ou "npm.ps1", feche e use o `cmd` como descrito (não o PowerShell).

---
## Parte 1 — Banco de dados (Supabase)
1. Acesse **supabase.com** > **Start your project** > entre com e-mail ou GitHub.
2. Crie uma organização (nome: `EMPIS`, tipo "Personal", plano **Free**).
3. **New project**: nome `empis-suporte`; crie uma **Database Password** forte e anote; **Region**: *South America (São Paulo)*; plano Free. Clique em **Create new project** e aguarde ~2 minutos.
4. No menu da esquerda abra **SQL Editor** > **New query**.
5. Abra o arquivo `supabase/migrations/001_tabelas.sql` no Bloco de Notas, copie TODO o conteúdo, cole no editor e clique em **Run**. Deve aparecer "Success. No rows returned".
6. Repita com `002_funcoes.sql` e depois `003_seguranca.sql` (sempre nessa ordem).
7. Confira em **Table Editor**: devem existir `professores`, `administradores`, `chamados`, `historico_chamados`, `conversas`, `mensagens`, `erros`, `contadores_protocolo`.
8. Cadastre o técnico: abra `supabase/seed_administradores.sql`, troque o nome e o telefone (formato `5531999998888`: 55 + DDD + número com 9) e rode no SQL Editor. Para mais técnicos, adicione mais linhas.
9. Anote duas informações (ficam em **Project Settings** > **API** / **API Keys**; o nome exato varia):
   - **Project URL** (algo como `https://abcdefgh.supabase.co`).
   - A chave **secreta** (`service_role` ou "secret key"). Clique em "Reveal". **Essa NÃO é a chave `anon`/publishable.** Essa chave dá acesso total ao banco: guarde só para você.

**Verificação:** as 8 tabelas existem e o técnico aparece em `administradores`.

---
## Parte 2 — Publicar o bot na Cloudflare
1. Crie a conta grátis em **dash.cloudflare.com/sign-up**. Confirme o e-mail. (Não precisa cartão nem domínio.)
2. No terminal, dentro da pasta do projeto, digite:
   ```
   npm install
   ```
   Isso baixa as ferramentas (leva alguns minutos). Avisos amarelos ("warn") são normais.
3. Rode os testes automáticos (opcional, mas recomendado):
   ```
   npm test
   ```
   Deve terminar com `# fail 0`.
4. Entre na Cloudflare pelo terminal:
   ```
   npx wrangler login
   ```
   O navegador abre; clique em **Allow**.
5. Publique:
   ```
   npx wrangler deploy
   ```
   Na primeira vez ele pede para criar um endereço "workers.dev": escolha um nome (ex.: `empis`). No final aparece algo como
   `https://empis-suporte-bot.empis.workers.dev`. **Copie esse endereço.**
6. Abra esse endereço no navegador: deve mostrar **"EMPIS Suporte Bot ativo."**

### Cadastrar os segredos (um comando para cada)
Cada comando abre uma pergunta; cole o valor (ele **não aparece** na tela, é normal) e tecle Enter.
```
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put VERIFY_TOKEN
```
- `VERIFY_TOKEN`: invente uma frase longa e aleatória (ex.: `girassol-azul-2026-xK9pQ`). Anote: vai ser usada na Meta.

Os outros três segredos (`WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `APP_SECRET`) virão da Meta na Parte 3.

Se pedir confirmação ("create a new Worker?"), responda `y`.

---
## Parte 3 — WhatsApp Cloud API (Meta), número de TESTE
1. Acesse **developers.facebook.com**, entre com seu Facebook e conclua o cadastro de desenvolvedor (confirmação por celular/e-mail).
2. **My Apps** > **Create App**. Nome: `EMPIS Suporte`. Escolha o caso de uso **"Conectar-se com clientes pelo WhatsApp"** (Connect with customers through WhatsApp). Se pedir um "portfólio empresarial", pode criar um com o nome da escola ou prosseguir sem, se a Meta permitir.
3. No painel do app, abra **WhatsApp > Configuração da API** (API Setup). Você verá:
   - Um **número de teste** da Meta (o "De"/From).
   - **Phone number ID** → anote.
   - **WhatsApp Business Account ID** → anote.
   - Um **token de acesso temporário** (vale 24 h; serve só para o primeiro teste).
4. No campo **Para** (To), adicione o **seu celular** de professor (com DDD) e confirme com o código que chega no WhatsApp. O número de teste só conversa com números cadastrados aqui (até 5).
5. Pegue o **App Secret**: **Configurações do app > Básico** > campo **Chave secreta do app** > Mostrar. Anote.
6. Cadastre os segredos no terminal:
   ```
   npx wrangler secret put PHONE_NUMBER_ID
   npx wrangler secret put APP_SECRET
   npx wrangler secret put WHATSAPP_TOKEN
   ```
   (no último, cole o token temporário por enquanto).
7. **Webhook:** em **WhatsApp > Configuração** (Configuration) > Webhook > **Editar**:
   - **URL de retorno**: `https://SEU-ENDERECO.workers.dev/webhook` (o endereço da Parte 2 + `/webhook`).
   - **Token de verificação**: a mesma frase do `VERIFY_TOKEN`.
   - Clique em **Verificar e salvar**. Se der erro, confira o endereço (precisa terminar em `/webhook`) e se o `VERIFY_TOKEN` foi cadastrado igual.
   - Em **Campos do webhook**, clique em **Gerenciar** e **assine (Subscribe) o campo `messages`**.
8. **Teste:** do seu celular, envie "oi" ao **número de teste** da Meta (salve-o nos contatos). O menu deve chegar. 🎉

### Se não responder
- Cloudflare > Workers & Pages > `empis-suporte-bot` > **Logs** (ou no terminal `npx wrangler tail`) e envie "oi" de novo. Procure a mensagem de erro.
- "Assinatura inválida" (401): o `APP_SECRET` está errado.
- "Configuração incompleta" (500): falta algum segredo (o log diz qual).
- Erro 190/401 da Meta ao enviar: token vencido. Faça o token permanente (abaixo).
- Erro 131030 ou "número não permitido": o celular não está na lista "Para" do passo 4.

### Token PERMANENTE (faça logo; o temporário vence em 24 h)
1. Acesse **business.facebook.com** > **Configurações do negócio** (Business Settings).
2. **Usuários > Usuários do sistema** > **Adicionar** (função Admin).
3. Selecione o usuário > **Adicionar ativos** > **Apps** > escolha `EMPIS Suporte` com controle total; faça o mesmo em **Contas do WhatsApp** com controle total.
4. **Gerar token** > escolha o app > expiração **Nunca** > marque `whatsapp_business_messaging` e `whatsapp_business_management` > Gerar. **Copie na hora** (não aparece de novo).
5. Troque o segredo: `npx wrangler secret put WHATSAPP_TOKEN` e cole o novo token.

---
## Parte 4 — Testar tudo
Siga **docs/CHECKLIST-TESTES-REAIS.md**. Para testar comandos de técnico, o número que usa os comandos precisa estar em `administradores`, e o "professor" precisa ser outro número (no teste da Meta, adicione os dois na lista "Para").

---
## Parte 5 — Guardar o código no GitHub (opcional agora, recomendado depois)
1. Crie conta em **github.com** > **New repository** > nome `empis-suporte-bot` > marque **Private** > Create.
2. Clique em **uploading an existing file**, arraste o **conteúdo** da pasta do projeto (NÃO envie a pasta `node_modules` nem arquivos `.dev.vars`/`.env`) e clique em **Commit changes**.
3. O repositório precisa ser **privado**. Nunca coloque tokens nele.

---
## Parte 6 — Atualizar o bot depois
1. Edite os arquivos (ex.: `src/texts.js` para mudar mensagens) e salve.
2. No terminal, na pasta do projeto: `npm test` e depois `npx wrangler deploy`.
3. Os chamados **não se perdem**: ficam no Supabase, separados do código. Mudanças no banco entram como novos arquivos `supabase/migrations/004_...sql`, rodados no SQL Editor.

---
## Parte 7 — Custos e limites (resumo; detalhes em docs/MANUTENCAO.md)
- Cloudflare grátis: 100 mil requisições/dia. Supabase grátis: 500 MB, **pausa após 7 dias sem uso** (o bot faz uma consulta diária para evitar) e **sem backup automático**.
- Meta: respostas dentro de 24 h da mensagem do professor são grátis. Mensagens fora dessa janela exigem template e podem custar centavos; o bot não envia essas.

---
## Parte 8 — Conectar o número DEFINITIVO do TI (faça só com tudo testado)
**Antes de qualquer coisa, entenda o risco:** o modo comum da API registra o número por SMS/ligação e o número **deixa de funcionar no aplicativo do celular**. Por isso, use a **Coexistência**, o modo oficial da Meta que mantém o número no app **WhatsApp Business** e na API ao mesmo tempo, ligando os dois com **QR Code**.

Requisitos (confirme na tela da Meta):
- O número precisa estar no aplicativo **WhatsApp Business** (verde com "B"), na versão **2.24.17 ou superior**. Se estiver no WhatsApp comum, avise-me antes de mexer: existe uma migração segura, mas deve ser feita com cuidado e com seu aval.
- O número não pode estar ligado a outro provedor de API nem ter restrições da Meta.
- A Meta pode exigir **verificação do negócio** (documentos da escola/prefeitura, CNPJ).
- Mantenha o app aberto e atualizado no celular do número (a Meta pode desconectar a Coexistência se o app ficar muito tempo sem uso; confira o prazo na documentação da Meta).

Procedimento (os nomes na tela podem variar; me envie prints se travar):
1. No painel do app (Meta) vá em **WhatsApp > Configuração da API** > **Adicionar número de telefone** e escolha a opção de conectar um **"aplicativo WhatsApp Business existente"** (Coexistência).
2. Digite o número do TI. Aparecerá um **QR Code** no computador.
3. No celular do TI: WhatsApp Business > recado da Meta/"Conectar à plataforma de negócios" > **Escanear QR Code** > aprove. Escolha se quer importar o histórico (opcional).
4. Quando terminar, o número aparece na lista com um novo **Phone number ID**.
5. Atualize o segredo: `npx wrangler secret put PHONE_NUMBER_ID` (novo ID). Confira se o token permanente tem acesso à conta do WhatsApp desse número (Parte 3, Token permanente).
6. O webhook (Parte 3, passo 7) continua o mesmo. Garanta que o campo `messages` está assinado e, se existir, assine também `smb_message_echoes` (mensagens enviadas pelo app do celular).
7. Teste com o checklist usando o número definitivo.
8. **Opcional (valide antes):** para o bot ficar quieto automaticamente quando o técnico responde pelo app do celular, altere `PAUSAR_AO_RESPONDER_NO_APP = "true"` no `wrangler.toml`, rode `npx wrangler deploy` e teste: responda como técnico pelo app e veja se o bot cala. Se o bot parar de responder em conversas normais, volte para `"false"`. Eu não consegui validar esse comportamento aqui.

Os técnicos podem usar o app do celular normalmente nas conversas e, além disso, os comandos `/...` pelo número autorizado.

---
## Parte 9 — LGPD (boas práticas já incluídas)
- O bot informa ao professor, no cadastro, para que o nome e o telefone serão usados.
- Só o necessário é guardado (nome, telefone, chamados, mensagens). Nenhum dado é exposto publicamente (RLS ativado, sem regras públicas).
- Para apagar os dados de um professor a pedido dele, veja `docs/MANUTENCAO.md`.
- Informe formalmente a direção/prefeitura sobre o uso do WhatsApp para atendimento e peça orientação sobre o prazo de guarda dos registros.
