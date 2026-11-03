// ADAPTER: Evolution API (WhatsApp NAO oficial, temporario ate a verificacao da Meta).
// Aqui ficam as chamadas HTTP e a traducao dos eventos da Evolution para o formato do port.
import { normalizarMensagem, normalizarEco, resultadoOk, resultadoErro } from "./port.js";

const enc = new TextEncoder();

// Tipos da Evolution/Baileys -> tipos usados pelo bot
const TIPOS = {
  imageMessage: "image", videoMessage: "video", audioMessage: "audio", documentMessage: "document",
  stickerMessage: "sticker", locationMessage: "location", contactMessage: "contacts", pttMessage: "audio",
};
// Eventos internos que nao sao mensagens de verdade: ignorar (senao o bot responderia "so texto")
const IGNORAR = new Set([
  "reactionMessage", "protocolMessage", "senderKeyDistributionMessage", "messageContextInfo",
  "editedMessage", "pollUpdateMessage", "keepInChatMessage",
]);

async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(s))));
}

// Compara segredos em tempo constante (compara os hashes, entao o tamanho nao vaza)
async function iguaisSeguro(a, b) {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

// A Evolution nao assina o webhook como a Meta. Usamos um segredo compartilhado:
// header "x-webhook-secret" (preferido) ou ?secret= na URL. Sem segredo configurado, recusa tudo.
export async function authenticateEvolution(request, _rawBody, env) {
  const esperado = env.EVOLUTION_WEBHOOK_SECRET;
  if (!esperado) return false;
  let recebido = request.headers.get("x-webhook-secret");
  if (!recebido) {
    try { recebido = new URL(request.url).searchParams.get("secret"); } catch { recebido = null; }
  }
  if (!recebido) return false;
  return iguaisSeguro(recebido, esperado);
}

function numeroDoJid(key) {
  let jid = String(key?.remoteJid ?? "");
  // Contas novas podem vir como @lid (sem o telefone). Usa o numero real se a Evolution informar.
  if (jid.endsWith("@lid")) jid = String(key?.remoteJidAlt ?? key?.senderPn ?? "");
  if (!jid.endsWith("@s.whatsapp.net")) return null; // grupos (@g.us), status@broadcast etc.
  return jid.split("@")[0].split(":")[0].replace(/\D/g, "");
}

function desembrulhar(message) {
  let m = message && typeof message === "object" ? message : {};
  for (let i = 0; i < 3; i++) {
    const interno = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.documentWithCaptionMessage?.message;
    if (!interno) break;
    m = interno;
  }
  return m;
}

function tipoETexto(message) {
  const m = desembrulhar(message);
  const texto = m.conversation ?? m.extendedTextMessage?.text;
  if (typeof texto === "string") return { type: "text", text: texto };
  const chaves = Object.keys(m);
  if (!chaves.length || chaves.every((k) => IGNORAR.has(k))) return null;
  const k = chaves.find((c) => !IGNORAR.has(c));
  return { type: TIPOS[k] ?? "unknown", text: null };
}

// Converte o evento "messages.upsert" da Evolution em { messages, echoes }
export function parseEvolution(payload, env = {}) {
  const out = { messages: [], echoes: [] };
  if (!payload || typeof payload !== "object") return out;
  const evento = String(payload.event ?? "").toLowerCase().replace(/_/g, ".");
  if (evento !== "messages.upsert") return out;
  if (env.EVOLUTION_INSTANCE && payload.instance && payload.instance !== env.EVOLUTION_INSTANCE) return out;

  const itens = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
  for (const it of itens) {
    const key = it?.key;
    const numero = numeroDoJid(key);
    const conteudo = tipoETexto(it?.message);
    if (!numero || !conteudo || typeof key?.id !== "string") continue;
    if (key.fromMe === true) {
      const eco = normalizarEco({ wamid: key.id, to: numero, ...conteudo });
      if (eco) out.echoes.push(eco);
    } else {
      const msg = normalizarMensagem({ wamid: key.id, from: numero, name: it.pushName, ...conteudo });
      if (msg) out.messages.push(msg);
    }
  }
  return out;
}

// Cliente de envio. Nunca lanca erro: devolve { ok, wamid, error }
export function createEvolutionWa(env) {
  const base = String(env.EVOLUTION_URL ?? "").replace(/\/+$/, "");
  return {
    async send(to, text) {
      try {
        const res = await fetch(`${base}/message/sendText/${encodeURIComponent(env.EVOLUTION_INSTANCE)}`, {
          method: "POST",
          headers: { apikey: env.EVOLUTION_APIKEY, "Content-Type": "application/json" },
          body: JSON.stringify({ number: String(to), text: String(text) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const motivo = data?.response?.message ?? data?.message ?? data?.error ?? data;
          return resultadoErro(`${res.status} ${typeof motivo === "string" ? motivo : JSON.stringify(motivo)}`);
        }
        return resultadoOk(data?.key?.id ?? null);
      } catch (e) {
        return resultadoErro(e?.message ?? e);
      }
    },
  };
}

export const evolutionProvider = {
  name: "evolution",
  required: ["EVOLUTION_URL", "EVOLUTION_APIKEY", "EVOLUTION_INSTANCE", "EVOLUTION_WEBHOOK_SECRET"],
  // A Evolution nao tem etapa de verificacao por GET
  handleGet: () => new Response("Método não permitido", { status: 405 }),
  authenticate: authenticateEvolution,
  parse: parseEvolution,
  createWa: createEvolutionWa,
};
