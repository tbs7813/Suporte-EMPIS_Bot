// Logica do atendimento (sem IA): menus, passos da conversa e comandos do tecnico.
import { normalizePhone, cleanText, keyword, parseProtocolo, formatDate, primeiroNome } from "./util.js";
import {
  MENU, CATEGORIAS, STATUS, URGENCIA, TXT_NOME, TXT_CONSULTA, TXT_NAO_ENTENDI, TXT_SO_TEXTO, TXT_AJUDA_ADMIN,
} from "./texts.js";

const TEMPO_SESSAO_MS = 12 * 60 * 60 * 1000; // conversa parada ha 12h volta ao inicio
const NOME_RE = /^[\p{L}][\p{L}\s.\x27’-]{3,78}$/u;
const PALAVRAS_MENU = ["menu", "cancelar", "voltar", "0", "inicio"];

// ---------- envio + registro no banco ----------
async function say(ctx, toRaw, text, extra = {}) {
  let r;
  try { r = await ctx.wa.send(toRaw, text); } catch (e) { r = { ok: false, error: String(e?.message ?? e) }; }
  try {
    await ctx.db.registerMessage({
      wamid: r.wamid ?? null, direcao: "saida", remetente: "bot", destinatario: normalizePhone(toRaw),
      conteudo: text, tipo: "text", protocolo: extra.protocolo ?? null, chamado_id: extra.chamado_id ?? null, enviada: !!r.ok,
    });
  } catch (e) { console.error("falha ao registrar mensagem enviada", e?.message); }
  return r;
}

async function notifyAdmins(ctx, text) {
  if (!ctx.config?.notificar) return;
  try {
    for (const a of await ctx.db.listAdmins()) await say(ctx, a.wa_id || a.telefone, text);
  } catch (e) { console.error("falha ao notificar tecnicos", e?.message); }
}

// ---------- ponto de entrada ----------
export async function handleIncoming(ctx, msg) {
  const phone = normalizePhone(msg.from);
  const nova = await ctx.db.registerMessage({
    wamid: msg.wamid, direcao: "entrada", remetente: phone, destinatario: "bot",
    conteudo: msg.text ?? `[${msg.type}]`, tipo: msg.type ?? "unknown", enviada: true,
  });
  if (!nova) return { duplicada: true }; // a Meta reenviou a mesma mensagem: ignora
  if (await ctx.db.isAdmin(phone)) {
    await ctx.db.touchAdmin(phone, msg.from);
    return handleAdmin(ctx, msg, phone);
  }
  return handleProfessor(ctx, msg, phone);
}

// Mensagem enviada pelo tecnico direto no app do celular (Coexistencia)
export async function handleEcho(ctx, echo) {
  const phone = normalizePhone(echo.to);
  const nova = await ctx.db.registerMessage({
    wamid: echo.wamid, direcao: "saida", remetente: "tecnico_app", destinatario: phone,
    conteudo: echo.text ?? `[${echo.type}]`, tipo: echo.type ?? "unknown", enviada: true,
  });
  if (nova && ctx.config?.pausarEco) {
    await ctx.db.saveConversation({ telefone: phone, wa_id: echo.to, estado: "HUMANO", bot_pausado: true });
  }
}

// ---------- PROFESSOR ----------
async function handleProfessor(ctx, msg, phone) {
  const { db } = ctx;
  const to = msg.from;
  let conv = (await db.getConversation(phone)) ?? { telefone: phone, estado: "INICIO", dados: {}, bot_pausado: false, atualizado_em: null };
  const texto = msg.type === "text" ? cleanText(msg.text) : "";
  const kw = keyword(texto);

  // Atendimento humano: o bot fica em silencio (so avisa o tecnico)
  if (conv.bot_pausado) {
    if (kw === "menu") {
      await db.saveConversation({ telefone: phone, wa_id: to, estado: "MENU", dados: {}, bot_pausado: false });
      await say(ctx, to, "Atendimento automático retomado.\n\n" + MENU);
      return;
    }
    await db.saveConversation({ telefone: phone, wa_id: to });
    const prof = await db.getProfessorByPhone(phone);
    const proto = conv.dados?.protocolo ? ` (${conv.dados.protocolo})` : "";
    await notifyAdmins(ctx, `💬 ${prof?.nome ?? phone}${proto}:\n${texto || "[" + msg.type + "]"}`);
    return;
  }

  // Sessao antiga no meio de um fluxo: volta ao inicio
  if (!["INICIO", "MENU"].includes(conv.estado) && conv.atualizado_em && Date.now() - Date.parse(conv.atualizado_em) > TEMPO_SESSAO_MS) {
    conv.estado = "INICIO"; conv.dados = {};
  }

  const ir = async (estado, dados, resposta, extra) => {
    conv.estado = estado; conv.dados = dados;
    await db.saveConversation({ telefone: phone, wa_id: to, estado, dados, bot_pausado: false });
    await say(ctx, to, resposta, extra);
  };

  if (conv.estado === "INICIO") return ir("MENU", {}, MENU);
  if (msg.type !== "text" || !texto) return say(ctx, to, TXT_SO_TEXTO);
  if (PALAVRAS_MENU.includes(kw)) return ir("MENU", {}, MENU);

  const d = conv.dados ?? {};

  // ----- passos -----
  const perguntaEquip = (cat) => `*${CATEGORIAS[cat].nome}*\n\nQual equipamento apresenta o problema?\n${CATEGORIAS[cat].exemplo}`;

  const iniciarChamado = async (cat) => {
    const prof = await db.getProfessorByPhone(phone);
    if (!prof) return ir("NOME", { categoria: cat }, TXT_NOME);
    return ir("EQUIP", { categoria: cat }, perguntaEquip(cat));
  };

  const solicitarHumano = async (prof, prefixo = "") => {
    let ch = await db.findChamadoHumanoAberto(prof.id);
    if (!ch) {
      ch = await db.createChamado({
        professor_id: prof.id, categoria: "Atendimento humano", descricao: "O professor solicitou falar com o técnico.",
        urgencia: "nao_impede", humano: true, chave: msg.wamid,
      });
    }
    await db.saveConversation({ telefone: phone, wa_id: to, estado: "HUMANO", dados: { protocolo: ch.protocolo }, bot_pausado: true });
    await db.attachMessage(msg.wamid, { protocolo: ch.protocolo, chamado_id: ch.id });
    await say(ctx, to,
      `${prefixo}Sua solicitação foi registrada.\n\nProtocolo: ${ch.protocolo}\n\n` +
      "O atendimento automático foi *pausado* nesta conversa e um técnico foi avisado. " +
      "Ele responderá assim que possível (não há prazo garantido).\n\n" +
      "Se quiser voltar ao menu automático, digite *menu*.", { protocolo: ch.protocolo, chamado_id: ch.id });
    await notifyAdmins(ctx, `🙋 ${prof.nome} pediu para falar com o técnico.\nProtocolo: ${ch.protocolo}\nResponda com: /responder ${ch.protocolo} sua mensagem`);
  };

  const listar = async (grupo) => {
    const prof = await db.getProfessorByPhone(phone);
    const lista = prof ? await db.listChamadosPorProfessor(prof.id, grupo, 10) : [];
    if (!lista.length) {
      return ir("INICIO", {}, grupo === "abertos" ? "Você não possui chamados abertos no momento.\n\nDigite *menu* para voltar." : "Você ainda não possui chamados anteriores.\n\nDigite *menu* para voltar.");
    }
    const linhas = lista.map((c) => `• ${c.protocolo} — ${c.categoria} — ${STATUS[c.status]} (${formatDate(c.aberto_em)})`).join("\n");
    return ir("INICIO", {}, `*${grupo === "abertos" ? "Seus chamados abertos" : "Chamados anteriores"}:*\n\n${linhas}\n\nPara ver os detalhes, digite *8*, depois *3* e informe o protocolo.\nDigite *menu* para voltar.`);
  };

  const meuChamado = async (protocolo) => {
    const prof = await db.getProfessorByPhone(phone);
    const ch = await db.getChamadoByProtocolo(protocolo);
    // Mesmo texto para "nao existe" e "e de outro professor": nao vaza informacao
    if (!prof || !ch || ch.professor_id !== prof.id) return null;
    return ch;
  };

  switch (conv.estado) {
    case "MENU": {
      if (CATEGORIAS[kw]) return iniciarChamado(kw);
      if (kw === "8") return ir("CONSULTA", {}, TXT_CONSULTA);
      if (kw === "9") {
        const prof = await db.getProfessorByPhone(phone);
        if (!prof) return ir("NOME", { categoria: "HUMANO" }, TXT_NOME);
        return solicitarHumano(prof);
      }
      return ir("MENU", {}, TXT_NAO_ENTENDI + MENU);
    }

    case "NOME": {
      if (!NOME_RE.test(texto) || texto.split(/\s+/).length < 2) {
        return ir("NOME", d, "Não consegui entender. Por favor, digite seu *nome completo* (nome e sobrenome), usando apenas letras.");
      }
      const prof = await db.createProfessor({ telefone: phone, nome: texto });
      const ola = `Obrigado, ${primeiroNome(prof.nome)}! Seu cadastro foi concluído.\n\n`;
      if (d.categoria === "HUMANO") return solicitarHumano(prof, ola);
      return ir("EQUIP", d, ola + perguntaEquip(d.categoria));
    }

    case "EQUIP": {
      if (texto.length < 2) return ir("EQUIP", d, "Por favor, informe o equipamento com pelo menos duas letras.");
      return ir("DESC", { ...d, equipamento: cleanText(texto, 120) },
        "Descreva o problema com o máximo de detalhes possível: o que está acontecendo, desde quando e se aparece alguma mensagem de erro.");
    }

    case "DESC": {
      if (texto.length < 10) return ir("DESC", d, "Preciso de um pouco mais de detalhes (pelo menos uma frase curta). Descreva o problema, por favor.");
      return ir("LOCAL", { ...d, descricao: cleanText(texto, 1000) }, "Em qual *sala ou local* da escola está o equipamento?\nEx.: Sala 12, Biblioteca, Secretaria");
    }

    case "LOCAL": {
      if (texto.length < 2) return ir("LOCAL", d, "Por favor, informe a sala ou o local do equipamento.");
      return ir("URG", { ...d, local: cleanText(texto, 80) }, "O problema *impede alguma atividade neste momento*?\n\n1 - Sim, impede.\n2 - Não impede.");
    }

    case "URG": {
      if (kw !== "1" && kw !== "2") return ir("URG", d, "Digite *1* se o problema impede uma atividade agora ou *2* se não impede.");
      const dados = { ...d, urgencia: kw === "1" ? "impede_atividade" : "nao_impede" };
      const cat = CATEGORIAS[dados.categoria].nome;
      return ir("CONFIRM", dados,
        `*Confira as informações:*\n\nCategoria: ${cat}\nEquipamento: ${dados.equipamento}\nDescrição: ${dados.descricao}\nLocal: ${dados.local}\nImpede atividade agora: ${kw === "1" ? "Sim" : "Não"}\n\nDigite:\n1 - Confirmar e registrar o chamado.\n2 - Cancelar.`);
    }

    case "CONFIRM": {
      if (kw === "2") return ir("INICIO", {}, "Chamado cancelado. Nenhum registro foi criado.\n\nDigite *menu* quando quiser recomeçar.");
      if (kw !== "1") return ir("CONFIRM", d, "Digite *1* para confirmar e registrar o chamado ou *2* para cancelar.");
      const prof = await db.getProfessorByPhone(phone);
      if (!prof) return ir("NOME", d, TXT_NOME);
      const ch = await db.createChamado({
        professor_id: prof.id, categoria: CATEGORIAS[d.categoria].nome, equipamento: d.equipamento,
        descricao: d.descricao, local: d.local, urgencia: d.urgencia, humano: false, chave: msg.wamid,
      });
      await db.attachMessage(msg.wamid, { protocolo: ch.protocolo, chamado_id: ch.id });
      await ir("INICIO", {},
        `Seu chamado foi registrado com sucesso!\n\nProtocolo: ${ch.protocolo}\n\nCategoria: ${ch.categoria}.\n\nStatus: ${STATUS[ch.status]}.\n\n` +
        "Nossa equipe de suporte técnico foi informada. O atendimento será feito conforme a disponibilidade da equipe" +
        (d.urgencia === "impede_atividade" ? " (marcamos que o problema impede uma atividade)" : "") +
        ".\n\nPara acompanhar, digite *menu* e escolha a opção 8.\n\nAgradecemos por utilizar o suporte técnico da EMPIS!",
        { protocolo: ch.protocolo, chamado_id: ch.id });
      await notifyAdmins(ctx, `🆕 Novo chamado ${ch.protocolo}\n${prof.nome}\n${ch.categoria} — ${ch.equipamento}\nLocal: ${ch.local}\n${URGENCIA[ch.urgencia]}\n\n${ch.descricao}`);
      return;
    }

    case "CONSULTA": {
      if (kw === "1") return listar("abertos");
      if (kw === "2") return listar("anteriores");
      if (kw === "3") return ir("BUSCA_PROTOCOLO", {}, "Digite o número do protocolo. Ex.: EMPIS-2026-00001");
      if (kw === "4") {
        const prof = await db.getProfessorByPhone(phone);
        const abertos = prof ? await db.listChamadosPorProfessor(prof.id, "abertos", 10) : [];
        if (!abertos.length) return ir("INICIO", {}, "Você não tem chamados abertos para acrescentar informações.\n\nDigite *menu* para voltar.");
        const linhas = abertos.map((c) => `• ${c.protocolo} — ${c.categoria}`).join("\n");
        return ir("INFO_PROTOCOLO", {}, `Seus chamados abertos:\n\n${linhas}\n\nDigite o *protocolo* do chamado que deseja complementar.`);
      }
      return ir("CONSULTA", {}, TXT_NAO_ENTENDI + TXT_CONSULTA);
    }

    case "BUSCA_PROTOCOLO": {
      const protocolo = parseProtocolo(texto);
      if (!protocolo) return ir("BUSCA_PROTOCOLO", {}, "Protocolo inválido. O formato é EMPIS-2026-00001. Tente novamente ou digite *menu*.");
      const ch = await meuChamado(protocolo);
      if (!ch) return ir("INICIO", {}, "Não encontrei esse protocolo entre os seus chamados.\n\nDigite *menu* para voltar.");
      const hist = (await db.getHistorico(ch.id, 20))
        .filter((h) => ["resposta_tecnico", "status", "info_complementar"].includes(h.tipo)).slice(-3);
      const linhasH = hist.map((h) => `• ${formatDate(h.criado_em)} — ${h.tipo === "resposta_tecnico" ? "Técnico: " : ""}${h.texto}`).join("\n");
      return ir("INICIO", {},
        `*Protocolo:* ${ch.protocolo}\n*Categoria:* ${ch.categoria}\n*Equipamento:* ${ch.equipamento ?? "-"}\n*Local:* ${ch.local ?? "-"}\n*Status:* ${STATUS[ch.status]}\n*Aberto em:* ${formatDate(ch.aberto_em)}` +
        (ch.concluido_em ? `\n*Concluído em:* ${formatDate(ch.concluido_em)}` : "") +
        (linhasH ? `\n\n*Últimas atualizações:*\n${linhasH}` : "") + "\n\nDigite *menu* para voltar.");
    }

    case "INFO_PROTOCOLO": {
      const protocolo = parseProtocolo(texto);
      if (!protocolo) return ir("INFO_PROTOCOLO", {}, "Protocolo inválido. O formato é EMPIS-2026-00001. Tente novamente ou digite *menu*.");
      const ch = await meuChamado(protocolo);
      if (!ch) return ir("INICIO", {}, "Não encontrei esse protocolo entre os seus chamados.\n\nDigite *menu* para voltar.");
      if (["resolvido", "cancelado"].includes(ch.status)) {
        return ir("INICIO", {}, "Este chamado já foi encerrado. Se o problema voltou, abra um novo chamado pelo menu.\n\nDigite *menu* para voltar.");
      }
      return ir("INFO_TEXTO", { protocolo }, `Digite a informação que deseja acrescentar ao chamado ${protocolo}:`);
    }

    case "INFO_TEXTO": {
      if (texto.length < 3) return ir("INFO_TEXTO", d, "Por favor, escreva a informação que deseja acrescentar.");
      const ch = await meuChamado(d.protocolo);
      if (!ch) return ir("INICIO", {}, "Não encontrei esse chamado. Digite *menu* para voltar.");
      await db.addHistorico({ chamado_id: ch.id, tipo: "info_complementar", texto: cleanText(texto, 1000), autor: "professor" });
      await db.attachMessage(msg.wamid, { protocolo: ch.protocolo, chamado_id: ch.id });
      await ir("INICIO", {}, `Informação registrada no chamado ${ch.protocolo}. Obrigado!\n\nDigite *menu* para voltar.`, { protocolo: ch.protocolo, chamado_id: ch.id });
      await notifyAdmins(ctx, `ℹ️ Nova informação no chamado ${ch.protocolo} (${ch.professor?.nome ?? ""}):\n${cleanText(texto, 500)}`);
      return;
    }

    default:
      return ir("MENU", {}, MENU);
  }
}

// ---------- TECNICO (somente numeros cadastrados em "administradores") ----------
async function handleAdmin(ctx, msg, phone) {
  const { db } = ctx;
  const to = msg.from;
  const texto = msg.type === "text" ? cleanText(msg.text, 1600) : "";
  if (!texto.startsWith("/")) return say(ctx, to, "Olá, técnico! Envie um comando. Digite /ajuda para ver a lista.");

  const partes = texto.split(/\s+/);
  const cmd = partes[0].toLowerCase();

  const carregar = async () => {
    const protocolo = parseProtocolo(partes[1] ?? "");
    if (!protocolo) { await say(ctx, to, `Informe o protocolo. Ex.: ${cmd} EMPIS-2026-00001`); return null; }
    const ch = await db.getChamadoByProtocolo(protocolo);
    if (!ch) { await say(ctx, to, `Protocolo ${protocolo} não encontrado.`); return null; }
    return ch;
  };
  const avisarProfessor = (ch, txt) =>
    db.getWaId(ch.professor.telefone).then((wa) => say(ctx, wa || ch.professor.telefone, txt, { protocolo: ch.protocolo, chamado_id: ch.id }));
  const LIMITE24H = "Provável causa: o professor não escreveu nas últimas 24 horas (regra do WhatsApp). A informação ficou salva no histórico.";
  const resumo = (c, i) =>
    `${i + 1}. ${c.protocolo} | ${c.categoria} | ${c.professor?.nome ?? "?"} | ${c.local ?? "-"} | ${c.urgencia === "impede_atividade" ? "⚠️ impede atividade" : "normal"} | ${STATUS[c.status]}${c.humano ? " | 🙋 pediu técnico" : ""}`;

  switch (cmd) {
    case "/ajuda":
      return say(ctx, to, TXT_AJUDA_ADMIN);

    case "/chamados":
    case "/abertos": {
      const lista = await db.listChamadosPorStatus(cmd === "/abertos" ? ["aberto"] : ["aberto", "em_atendimento"], 15);
      if (!lista.length) return say(ctx, to, cmd === "/abertos" ? "Nenhum chamado aberto. ✅" : "Nenhum chamado pendente. ✅");
      return say(ctx, to, `*${cmd === "/abertos" ? "Chamados abertos" : "Chamados pendentes"}* (mais antigos primeiro):\n\n${lista.map(resumo).join("\n")}\n\nUse /protocolo CODIGO para ver os detalhes.`);
    }

    case "/protocolo": {
      const ch = await carregar(); if (!ch) return;
      const hist = await db.getHistorico(ch.id, 5);
      const h = hist.map((x) => `• ${formatDate(x.criado_em)} [${x.tipo}] ${x.texto}`).join("\n");
      return say(ctx, to,
        `*${ch.protocolo}* — ${STATUS[ch.status]}\nProfessor: ${ch.professor?.nome} (${ch.professor?.telefone})\nCategoria: ${ch.categoria}\nEquipamento: ${ch.equipamento ?? "-"}\nLocal: ${ch.local ?? "-"}\n${URGENCIA[ch.urgencia]}\nTécnico: ${ch.tecnico_telefone ?? "-"}\nAberto em: ${formatDate(ch.aberto_em)}\n\n${ch.descricao}` +
        (h ? `\n\n*Histórico:*\n${h}` : ""));
    }

    case "/assumir": {
      const ch = await carregar(); if (!ch) return;
      if (["resolvido", "cancelado"].includes(ch.status)) return say(ctx, to, `O chamado ${ch.protocolo} já está encerrado.`);
      await db.updateChamado(ch.id, { status: "em_atendimento", tecnico_telefone: phone });
      await db.addHistorico({ chamado_id: ch.id, tipo: "status", texto: "Status: Em atendimento (técnico assumiu)", autor: phone });
      const r = await avisarProfessor(ch, `O seu chamado ${ch.protocolo} agora está *em atendimento* pelo suporte técnico.`);
      return say(ctx, to, `Você assumiu o chamado ${ch.protocolo}.` + (r.ok ? " O professor foi avisado." : ` Não consegui avisar o professor. ${LIMITE24H}`));
    }

    case "/responder": {
      const ch = await carregar(); if (!ch) return;
      const resposta = texto.replace(/^\S+\s+\S+\s*/, "").trim();
      if (!resposta) return say(ctx, to, "Escreva a mensagem depois do protocolo.\nEx.: /responder EMPIS-2026-00001 Já estou indo até a sala.");
      const r = await avisarProfessor(ch, `*Resposta do suporte técnico* (${ch.protocolo}):\n\n${resposta}`);
      await db.addHistorico({ chamado_id: ch.id, tipo: r.ok ? "resposta_tecnico" : "resposta_nao_entregue", texto: resposta, autor: phone });
      if (r.ok) {
        // Enquanto o tecnico conversa, o bot fica quieto nessa conversa
        await db.saveConversation({ telefone: ch.professor.telefone, estado: "HUMANO", dados: { protocolo: ch.protocolo }, bot_pausado: true });
        return say(ctx, to, `Resposta enviada ao professor (${ch.protocolo}). O bot ficará em silêncio nessa conversa até você usar /resolver ou /retomar, ou o professor digitar menu.`);
      }
      return say(ctx, to, `Não consegui entregar a resposta. ${LIMITE24H}`);
    }

    case "/resolver": {
      const ch = await carregar(); if (!ch) return;
      if (ch.status === "resolvido") return say(ctx, to, `O chamado ${ch.protocolo} já estava resolvido.`);
      const obs = texto.replace(/^\S+\s+\S+\s*/, "").trim();
      await db.updateChamado(ch.id, { status: "resolvido", concluido_em: new Date().toISOString(), tecnico_telefone: ch.tecnico_telefone ?? phone });
      await db.addHistorico({ chamado_id: ch.id, tipo: "status", texto: "Status: Resolvido" + (obs ? ` — ${obs}` : ""), autor: phone });
      await db.saveConversation({ telefone: ch.professor.telefone, estado: "INICIO", dados: {}, bot_pausado: false });
      const r = await avisarProfessor(ch, `Seu chamado ${ch.protocolo} foi marcado como *resolvido*.` + (obs ? `\n\nObservação do técnico: ${obs}` : "") + "\n\nSe o problema continuar, digite *menu* e abra um novo chamado.");
      return say(ctx, to, `Chamado ${ch.protocolo} resolvido.` + (r.ok ? " O professor foi avisado." : ` Não consegui avisar o professor. ${LIMITE24H}`));
    }

    case "/retomar": {
      const ch = await carregar(); if (!ch) return;
      await db.saveConversation({ telefone: ch.professor.telefone, estado: "INICIO", dados: {}, bot_pausado: false });
      return say(ctx, to, `Atendimento automático retomado para ${ch.professor.nome}.`);
    }

    default:
      return say(ctx, to, "Comando não reconhecido. Digite /ajuda para ver a lista.");
  }
}
