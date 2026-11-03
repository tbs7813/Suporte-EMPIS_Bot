import { test } from "node:test";
import assert from "node:assert/strict";
import { validarEnvio, normalizarMensagem, normalizarEco, validarProvedor } from "../src/api-wpp/port.js";
import { parseEvolution, authenticateEvolution, createEvolutionWa } from "../src/api-wpp/evolution.adapter.js";
import { getProvider, createWaClient } from "../src/api-wpp/index.js";
import worker from "../src/index.js";

const envEvo = {
  WA_PROVIDER: "evolution", EVOLUTION_URL: "https://evo.exemplo.com/", EVOLUTION_APIKEY: "chave",
  EVOLUTION_INSTANCE: "empis", EVOLUTION_WEBHOOK_SECRET: "segredo-forte",
  SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_KEY: "k",
};

const evento = (data, extra = {}) => ({ event: "messages.upsert", instance: "empis", data, ...extra });
const msgTexto = (texto, key = {}) => ({
  key: { remoteJid: "5511987654321@s.whatsapp.net", fromMe: false, id: "ABC1", ...key },
  pushName: "Maria", message: { conversation: texto },
});

// ---------- PORT ----------
test("port: validarEnvio limpa destino, recusa vazio e limita tamanho", () => {
  assert.deepEqual(validarEnvio("+55 (11) 98765-4321", "  oi  "), { ok: true, to: "5511987654321", text: "oi" });
  assert.equal(validarEnvio("123", "oi").ok, false);
  assert.equal(validarEnvio("5511987654321", "   ").ok, false);
  assert.equal(validarEnvio("5511987654321", { a: 1 }).ok, false);
  assert.equal(validarEnvio("5511987654321", "x".repeat(9000)).text.length, 4000);
});

test("port: normalizarMensagem/Eco recusam dados invalidos", () => {
  assert.equal(normalizarMensagem(null), null);
  assert.equal(normalizarMensagem({ wamid: "", from: "5511987654321", type: "text", text: "oi" }), null);
  assert.equal(normalizarMensagem({ wamid: "a", from: "abc", type: "text", text: "oi" }), null);
  assert.deepEqual(normalizarMensagem({ wamid: "a", from: "5511987654321", type: "image" }),
    { wamid: "a", from: "5511987654321", name: null, type: "image", text: null });
  assert.equal(normalizarEco({ wamid: "a", to: "12" }), null);
  assert.equal(normalizarEco({ wamid: "a", to: "5511987654321", type: "text", text: "oi" }).text, "oi");
});

test("port: validarProvedor aponta o que falta no contrato", () => {
  assert.deepEqual(validarProvedor({ name: "x", required: [] }).sort(), ["authenticate", "createWa", "handleGet", "parse"]);
  assert.deepEqual(validarProvedor(getProvider({})), []);
});

// ---------- EVOLUTION: entrada ----------
test("evolution: texto vira mensagem; fromMe vira eco", () => {
  const r = parseEvolution(evento([msgTexto("menu"), msgTexto("ola prof", { fromMe: true, id: "ABC2" })]), envEvo);
  assert.deepEqual(r.messages, [{ wamid: "ABC1", from: "5511987654321", name: "Maria", type: "text", text: "menu" }]);
  assert.deepEqual(r.echoes, [{ wamid: "ABC2", to: "5511987654321", type: "text", text: "ola prof" }]);
});

test("evolution: aceita data como objeto, nome de evento em MAIUSCULO e extendedTextMessage", () => {
  const item = { key: { remoteJid: "5511987654321@s.whatsapp.net", fromMe: false, id: "X1" }, message: { extendedTextMessage: { text: "oi" } } };
  const r = parseEvolution({ event: "MESSAGES_UPSERT", instance: "empis", data: item }, envEvo);
  assert.equal(r.messages[0].text, "oi");
});

test("evolution: ignora grupos, status, reacoes, outros eventos e instancia diferente", () => {
  const g = msgTexto("oi", { remoteJid: "120363@g.us" });
  const st = msgTexto("oi", { remoteJid: "status@broadcast" });
  const reacao = { key: msgTexto("x").key, message: { reactionMessage: { text: "👍" } } };
  assert.equal(parseEvolution(evento([g, st, reacao]), envEvo).messages.length, 0);
  assert.equal(parseEvolution({ event: "connection.update", data: { state: "open" } }, envEvo).messages.length, 0);
  assert.equal(parseEvolution(evento([msgTexto("oi")], { instance: "outra" }), envEvo).messages.length, 0);
  assert.deepEqual(parseEvolution(null, envEvo), { messages: [], echoes: [] });
});

test("evolution: midia chega com o tipo certo e sem texto; @lid usa o numero alternativo", () => {
  const img = { key: msgTexto("x").key, message: { imageMessage: { caption: "foto" } } };
  const r = parseEvolution(evento([img]), envEvo);
  assert.equal(r.messages[0].type, "image");
  assert.equal(r.messages[0].text, null);

  const lid = msgTexto("oi", { remoteJid: "9999@lid", remoteJidAlt: "5511911112222@s.whatsapp.net" });
  assert.equal(parseEvolution(evento([lid]), envEvo).messages[0].from, "5511911112222");
  const semAlt = msgTexto("oi", { remoteJid: "9999@lid" });
  assert.equal(parseEvolution(evento([semAlt]), envEvo).messages.length, 0);
});

test("evolution: remove sufixo de dispositivo do JID", () => {
  const m = msgTexto("oi", { remoteJid: "5511987654321:12@s.whatsapp.net" });
  assert.equal(parseEvolution(evento([m]), envEvo).messages[0].from, "5511987654321");
});

// ---------- EVOLUTION: autenticacao ----------
test("evolution: webhook exige segredo correto (header ou query) e falha fechado sem config", async () => {
  const req = (url, headers = {}) => new Request(url, { method: "POST", headers, body: "{}" });
  assert.equal(await authenticateEvolution(req("https://w/webhook"), "", envEvo), false);
  assert.equal(await authenticateEvolution(req("https://w/webhook", { "x-webhook-secret": "errado" }), "", envEvo), false);
  assert.equal(await authenticateEvolution(req("https://w/webhook", { "x-webhook-secret": "segredo-forte" }), "", envEvo), true);
  assert.equal(await authenticateEvolution(req("https://w/webhook?secret=segredo-forte"), "", envEvo), true);
  assert.equal(await authenticateEvolution(req("https://w/webhook", { "x-webhook-secret": "" }), "", { ...envEvo, EVOLUTION_WEBHOOK_SECRET: "" }), false);
});

// ---------- EVOLUTION: envio ----------
test("evolution: send monta a chamada correta e devolve o id; erros nao lancam excecao", async () => {
  const original = globalThis.fetch;
  const chamadas = [];
  try {
    globalThis.fetch = async (url, init) => {
      chamadas.push({ url, init });
      return new Response(JSON.stringify({ key: { id: "OUT1" } }), { status: 201 });
    };
    const r = await createEvolutionWa(envEvo).send("5511987654321", "oi");
    assert.deepEqual(r, { ok: true, wamid: "OUT1" });
    assert.equal(chamadas[0].url, "https://evo.exemplo.com/message/sendText/empis");
    assert.equal(chamadas[0].init.headers.apikey, "chave");
    assert.deepEqual(JSON.parse(chamadas[0].init.body), { number: "5511987654321", text: "oi" });

    globalThis.fetch = async () => new Response(JSON.stringify({ response: { message: ["numero nao existe"] } }), { status: 400 });
    const falha = await createEvolutionWa(envEvo).send("5511987654321", "oi");
    assert.equal(falha.ok, false);
    assert.match(falha.error, /^400 /);

    globalThis.fetch = async () => { throw new Error("rede caiu"); };
    assert.deepEqual(await createEvolutionWa(envEvo).send("5511987654321", "oi"), { ok: false, error: "rede caiu" });
  } finally { globalThis.fetch = original; }
});

test("fabrica: createWaClient valida antes de chamar o provedor", async () => {
  const falso = { createWa: () => ({ send: async (to, text) => ({ ok: true, wamid: `${to}|${text}` }) }) };
  const wa = createWaClient(falso, {});
  assert.deepEqual(await wa.send("+55 11 98765-4321", " oi "), { ok: true, wamid: "5511987654321|oi" });
  assert.equal((await wa.send("x", "oi")).ok, false);
});

// ---------- FABRICA / WORKER ----------
test("fabrica: WA_PROVIDER escolhe o adapter; vazio = meta; invalido gera erro", () => {
  assert.equal(getProvider({}).name, "meta");
  assert.equal(getProvider({ WA_PROVIDER: " Evolution " }).name, "evolution");
  assert.throws(() => getProvider({ WA_PROVIDER: "telegram" }), /WA_PROVIDER invalido/);
});

test("worker com evolution: GET 405, sem segredo 401, com segredo 200, config faltando 500", async () => {
  const ctx = { waitUntil: () => {} };
  const post = (headers = {}) => new Request("https://w/webhook", { method: "POST", headers, body: JSON.stringify(evento([])) });
  assert.equal((await worker.fetch(new Request("https://w/webhook"), envEvo, ctx)).status, 405);
  assert.equal((await worker.fetch(post(), envEvo, ctx)).status, 401);
  assert.equal((await worker.fetch(post({ "x-webhook-secret": "segredo-forte" }), envEvo, ctx)).status, 200);
  assert.equal((await worker.fetch(post(), { ...envEvo, EVOLUTION_APIKEY: "" }, ctx)).status, 500);
  assert.equal((await worker.fetch(post(), { ...envEvo, WA_PROVIDER: "xyz" }, ctx)).status, 500);
});
