// Todos os textos que o bot envia ficam aqui, para voce poder editar facilmente.

export const MENU = `Olá! Seja bem-vindo ao Suporte Técnico da Escola Municipal Professora Isaura Santos — EMPIS.

Sou o assistente virtual do suporte técnico.

Como posso ajudar você hoje?

Digite o número da opção desejada:

1 - Internet e Wi-Fi.
2 - Computadores e notebooks.
3 - Impressoras.
4 - Projetores e equipamentos multimídia.
5 - Tablets e Chromebooks.
6 - Sistemas, contas e acessos.
7 - Outros problemas.
8 - Consultar chamado.
9 - Falar com o técnico.`;

export const CATEGORIAS = {
  "1": { nome: "Internet e Wi-Fi", exemplo: "Ex.: Wi-Fi da sala, roteador, ponto de rede" },
  "2": { nome: "Computadores e notebooks", exemplo: "Ex.: notebook da sala 5, computador da biblioteca" },
  "3": { nome: "Impressoras", exemplo: "Ex.: impressora da secretaria" },
  "4": { nome: "Projetores e equipamentos multimídia", exemplo: "Ex.: projetor da sala 8, caixa de som, TV" },
  "5": { nome: "Tablets e Chromebooks", exemplo: "Ex.: Chromebook nº 12, tablet do carrinho B" },
  "6": { nome: "Sistemas, contas e acessos", exemplo: "Ex.: e-mail institucional, Google Sala de Aula, sistema de notas" },
  "7": { nome: "Outros problemas", exemplo: "Ex.: descreva o equipamento ou serviço" },
};

export const STATUS = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  resolvido: "Resolvido",
  cancelado: "Cancelado",
};

export const URGENCIA = {
  impede_atividade: "Impede uma atividade agora",
  nao_impede: "Não impede atividade no momento",
};

export const TXT_NOME = `Para registrar seu atendimento, preciso do seu *nome completo*.

Seu nome e telefone serão usados apenas para o atendimento do suporte técnico da EMPIS.

Digite seu nome completo:`;

export const TXT_CONSULTA = `*Consultar chamado* — digite o número da opção:

1 - Meus chamados abertos.
2 - Chamados anteriores.
3 - Pesquisar pelo número de protocolo.
4 - Acrescentar informação a um chamado.

Digite *menu* para voltar ao início.`;

export const TXT_NAO_ENTENDI = `Desculpe, não entendi sua mensagem. 😕
Por favor, digite apenas o *número* da opção desejada.

`;

export const TXT_SO_TEXTO =
  "Desculpe, por enquanto consigo ler apenas mensagens de *texto*. Por favor, digite sua resposta.";

export const TXT_AJUDA_ADMIN = `*Comandos do técnico*

/chamados — chamados pendentes (abertos e em atendimento)
/abertos — somente os chamados abertos
/protocolo EMPIS-2026-00001 — detalhes de um chamado
/assumir EMPIS-2026-00001 — assumir o atendimento
/responder EMPIS-2026-00001 sua mensagem — responder ao professor
/resolver EMPIS-2026-00001 observação — encerrar o chamado (observação é opcional)
/retomar EMPIS-2026-00001 — devolver a conversa ao bot
/ajuda — mostrar esta lista`;
