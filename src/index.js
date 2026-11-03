// Cloudflare Worker: recebe os avisos (webhook) da Meta e executa o bot.
import { createDb } from "./db.js";
import { getProvider, createWaClient } from "./api-wpp/index.js";
import { handleIncoming, handleEcho } from "./bot.js";

// Segredos comuns; os do WhatsApp dependem do provedor escolhido em WA_PROVIDER
const OBRIGATORIAS = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"];

function faltando(env, provider) {
  return [...provider.required, ...OBRIGATORIAS].filter((k) => !env[k]);
}

async function processar(env, payload, provider) {
  const db = createDb(env);
  const ctx = {
    db,
    wa: createWaClient(provider, env),
    config: { notificar: env.NOTIFICAR_TECNICOS !== "false", pausarEco: env.PAUSAR_AO_RESPONDER_NO_APP === "true" },
  };
  const { messages, echoes } = provider.parse(payload, env);
  for (const m of messages) {
    try {
      await handleIncoming(ctx, m);
    } catch (e) {
      console.error("erro ao processar mensagem", e?.message);
      try { await db.logError("handleIncoming", e?.message ?? String(e), { wamid: m.wamid }); } catch {}
      try { await ctx.wa.send(m.from, "Desculpe, ocorreu um erro temporário. Por favor, tente novamente em alguns instantes."); } catch {}
    }
  }
  for (const e of echoes) {
    try { await handleEcho(ctx, e); } catch (err) { console.error("erro no eco", err?.message); }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/") return new Response("EMPIS Suporte Bot ativo.", { status: 200 });
    if (url.pathname !== "/webhook") return new Response("Não encontrado", { status: 404 });

    let provider;
    try { provider = getProvider(env); } catch (e) {
      console.error(e?.message);
      return new Response("Configuração incompleta", { status: 500 });
    }
    const f = faltando(env, provider);
    if (f.length) {
      console.error(`Segredos faltando (${provider.name}):`, f.join(", "));
      return new Response("Configuração incompleta", { status: 500 });
    }

    // Verificacao inicial do webhook (a Meta usa GET; a Evolution responde 405)
    if (request.method === "GET") return provider.handleGet(url, env);

    if (request.method === "POST") {
      const raw = await request.text();
      const ok = await provider.authenticate(request, raw, env);
      if (!ok) return new Response("Assinatura inválida", { status: 401 });
      let payload;
      try { payload = JSON.parse(raw); } catch { return new Response("JSON inválido", { status: 400 }); }
      // Responde "OK" rapido ao provedor e processa em seguida
      ctx.waitUntil(processar(env, payload, provider));
      return new Response("OK", { status: 200 });
    }

    return new Response("Método não permitido", { status: 405 });
  },

  // Tarefa diaria: acessa o banco para ele nao "dormir" por inatividade
  async scheduled(event, env, ctx) {
    ctx.waitUntil(createDb(env).ping().catch((e) => console.error("ping falhou", e?.message)));
  },
};
