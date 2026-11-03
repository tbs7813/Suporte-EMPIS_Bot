import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleIncoming, handleEcho } from "../src/bot.js";
import { verifySignature, parseWebhook } from "../src/whatsapp.js";
import { normalizePhone, parseProtocolo } from "../src/util.js";
import { createFakeDb, createFakeWa } from "./fakes.js";

const PROF = "5531988887777";
const PROF2 = "5531977776666";
const TEC = "5531999998888";
const ANO = new Date().getFullYear();
let contador = 0;

function novoAmbiente(opts = {}) {
  const db = createFakeDb();
  db._s.administradores.push({ telefone: TEC, nome: "Tecnico", ativo: true });
  const wa = createFakeWa(opts);
  const ctx = { db, wa, config: { notificar: opts.notificar ?? false, pausarEco: false } };
  const diz = (from, text, wamid) => handleIncoming(ctx, { wamid: wamid ?? `in-${++contador}`, from, type: "text", text });
  return { db, wa, ctx, diz };
}

async function abrirChamado(diz, from, nome = "Maria da Silva") {
  await diz(from, "oi");
  await diz(from, "1");
  await diz(from, nome);
  await diz(from, "Roteador da sala");
  await diz(from, "O Wi-Fi cai toda hora desde ontem");
  await diz(from, "Sala 12");
  await diz(from, "1");
  await diz(from, "1");
}

test("1. primeiro contato mostra o menu", async () => {
  const { wa, diz } = novoAmbiente();
  await diz(PROF, "oi");
  assert.match(wa.ultima(PROF), /Seja bem-vindo ao Suporte Técnico/);
  assert.match(wa.ultima(PROF), /9 - Falar com o técnico/);
});

test("2/3/4/5. cadastro, abertura de chamado, protocolo e gravacao", async () => {
  const { db, wa, diz } = novoAmbiente();
  await abrirChamado(diz, PROF);
  assert.equal(db._s.professores.length, 1);
  assert.equal(db._s.professores[0].nome, "Maria da Silva");
  assert.equal(db._s.chamados.length, 1);
  assert.equal(db._s.chamados[0].protocolo, `EMPIS-${ANO}-00001`);
  assert.equal(db._s.chamados[0].urgencia, "impede_atividade");
  assert.match(wa.ultima(PROF), new RegExp(`Protocolo: EMPIS-${ANO}-00001`));
  assert.match(wa.ultima(PROF), /Status: Aberto/);
  assert.ok(db._s.mensagens.some((m) => m.direcao === "saida" && m.protocolo === `EMPIS-${ANO}-00001`));
});

test("protocolos sao sequenciais e unicos", async () => {
  const { db, diz } = novoAmbiente();
  await abrirChamado(diz, PROF);
  await abrirChamado(diz, PROF2, "Joao Pereira Souza");
  assert.deepEqual(db._s.chamados.map((c) => c.protocolo), [`EMPIS-${ANO}-00001`, `EMPIS-${ANO}-00002`]);
});

test("entradas invalidas sao tratadas (nome, menu, urgencia)", async () => {
  const { db, wa, diz } = novoAmbiente();
  await diz(PROF, "oi");
  await diz(PROF, "xyz");
  assert.match(wa.ultima(PROF), /não entendi/i);
  await diz(PROF, "1");
  await diz(PROF, "Maria");
  assert.match(wa.ultima(PROF), /nome completo/i);
  assert.equal(db._s.professores.length, 0);
  await diz(PROF, "Maria da Silva");
  await diz(PROF, "Notebook");
  await diz(PROF, "curto");
  assert.match(wa.ultima(PROF), /mais de detalhes/i);
});

test("6/7. consulta por protocolo e inclusao de informacoes", async () => {
  const { db, wa, diz } = novoAmbiente();
  await abrirChamado(diz, PROF);
  await diz(PROF, "menu"); await diz(PROF, "8"); await diz(PROF, "3"); await diz(PROF, `EMPIS-${ANO}-00001`);
  assert.match(wa.ultima(PROF), /Roteador da sala/);
  await diz(PROF, "menu"); await diz(PROF, "8"); await diz(PROF, "4"); await diz(PROF, `EMPIS-${ANO}-00001`);
  await diz(PROF, "Agora também não abre nenhum site");
  assert.ok(db._s.historico.some((h) => h.tipo === "info_complementar" && /nenhum site/.test(h.texto)));
});

test("professor nao ve chamado de outro professor", async () => {
  const { wa, diz } = novoAmbiente();
  await abrirChamado(diz, PROF);
  await diz(PROF2, "oi"); await diz(PROF2, "1"); await diz(PROF2, "Joao Pereira Souza");
  await diz(PROF2, "menu"); await diz(PROF2, "8"); await diz(PROF2, "3"); await diz(PROF2, `EMPIS-${ANO}-00001`);
  assert.match(wa.ultima(PROF2), /Não encontrei esse protocolo/);
  assert.doesNotMatch(wa.ultima(PROF2), /Roteador|Wi-Fi cai|Maria/);
});

test("8/9/10/11. tecnico lista, assume, responde e resolve; historico preservado", async () => {
  const { db, wa, diz } = novoAmbiente();
  await abrirChamado(diz, PROF);
  const proto = `EMPIS-${ANO}-00001`;
  await diz(TEC, "/chamados");
  assert.match(wa.ultima(TEC), new RegExp(proto));
  await diz(TEC, `/assumir ${proto}`);
  assert.equal(db._s.chamados[0].status, "em_atendimento");
  assert.match(wa.ultima(PROF), /em atendimento/);
  await diz(TEC, `/responder ${proto} Estou indo até a sala 12.`);
  assert.match(wa.ultima(PROF), /Estou indo até a sala 12/);
  assert.ok(db._s.historico.some((h) => h.tipo === "resposta_tecnico"));
  assert.ok(db._s.mensagens.some((m) => m.direcao === "saida" && /Estou indo/.test(m.conteudo) && m.protocolo === proto));
  await diz(TEC, `/resolver ${proto} Reiniciei o roteador`);
  assert.equal(db._s.chamados[0].status, "resolvido");
  assert.ok(db._s.chamados[0].concluido_em);
  assert.match(wa.ultima(PROF), /resolvido/);
  await diz(PROF, "menu"); await diz(PROF, "8"); await diz(PROF, "2");
  assert.match(wa.ultima(PROF), new RegExp(proto)); // aparece em "chamados anteriores"
});

test("12. continua de onde parou apos reiniciar (estado vem do banco)", async () => {
  const { db, wa, diz } = novoAmbiente();
  await diz(PROF, "oi"); await diz(PROF, "3"); await diz(PROF, "Ana Lima Costa");
  const wa2 = createFakeWa();
  const diz2 = (t) => handleIncoming({ db, wa: wa2, config: { notificar: false } }, { wamid: `in-${++contador}`, from: PROF, type: "text", text: t });
  await diz2("Impressora da secretaria"); // "instancia nova", mesmo banco
  assert.match(wa2.ultima(PROF), /Descreva o problema/);
});

test("13. mensagem duplicada (reenvio da Meta) nao gera resposta nem chamado repetido", async () => {
  const { db, wa, diz } = novoAmbiente();
  await abrirChamado(diz, PROF);
  const antes = wa.enviadas.length;
  await diz(PROF, "1", "DUP-1");
  const depoisPrimeira = wa.enviadas.length;
  const r = await diz(PROF, "1", "DUP-1");
  assert.equal(r.duplicada, true);
  assert.equal(wa.enviadas.length, depoisPrimeira);
  assert.ok(depoisPrimeira > antes);
  assert.equal(db._s.chamados.length, 1);
});

test("14. professor nao consegue usar comandos de tecnico", async () => {
  const { db, wa, diz } = novoAmbiente();
  await abrirChamado(diz, PROF);
  await diz(PROF, "/resolver EMPIS-" + ANO + "-00001");
  assert.equal(db._s.chamados[0].status, "aberto");
  assert.doesNotMatch(wa.ultima(PROF), /resolvido/);
  await diz(PROF, "/chamados");
  assert.doesNotMatch(wa.ultima(PROF), /Chamados pendentes/);
});

test("atendimento humano: pausa o bot, tecnico responde, professor volta com menu", async () => {
  const { db, wa, diz } = novoAmbiente({ notificar: true });
  await diz(PROF, "oi"); await diz(PROF, "9"); await diz(PROF, "Maria da Silva");
  assert.match(wa.ultima(PROF), /pausado/);
  assert.equal(db._s.chamados[0].humano, true);
  assert.equal(db._s.conversas[PROF].bot_pausado, true);
  const antes = wa.enviadas.filter((e) => e.to === PROF).length;
  await diz(PROF, "Alguém aí?");
  assert.equal(wa.enviadas.filter((e) => e.to === PROF).length, antes); // bot calado
  assert.ok(wa.enviadas.some((e) => e.to === TEC && /Alguém aí/.test(e.text))); // tecnico foi avisado
  await diz(PROF, "menu");
  assert.equal(db._s.conversas[PROF].bot_pausado, false);
  assert.match(wa.ultima(PROF), /Atendimento automático retomado/);
});

test("resposta do tecnico fora da janela de 24h avisa o tecnico e guarda no historico", async () => {
  const { db, wa, diz } = novoAmbiente({ falharPara: [PROF] });
  await abrirChamado(diz, PROF);
  await diz(TEC, `/responder EMPIS-${ANO}-00001 Olá`);
  assert.match(wa.ultima(TEC), /Não consegui entregar/);
  assert.ok(db._s.historico.some((h) => h.tipo === "resposta_nao_entregue"));
});

test("eco de mensagem enviada pelo app do celular e registrado (e pausa se habilitado)", async () => {
  const { db, ctx } = novoAmbiente();
  await handleEcho(ctx, { wamid: "eco-1", to: PROF, type: "text", text: "Oi, já vou aí" });
  assert.ok(db._s.mensagens.some((m) => m.wamid === "eco-1" && m.remetente === "tecnico_app"));
  assert.equal(db._s.conversas[PROF], undefined);
  ctx.config.pausarEco = true;
  await handleEcho(ctx, { wamid: "eco-2", to: PROF, type: "text", text: "ok" });
  assert.equal(db._s.conversas[PROF].bot_pausado, true);
});

test("assinatura do webhook: valida, rejeita adulterada e ausente", async () => {
  const corpo = JSON.stringify({ a: 1 });
  const bom = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
  assert.equal(await verifySignature(corpo, bom, "segredo"), true);
  assert.equal(await verifySignature(corpo + " ", bom, "segredo"), false);
  assert.equal(await verifySignature(corpo, bom, "outro"), false);
  assert.equal(await verifySignature(corpo, null, "segredo"), false);
});

test("parseWebhook extrai mensagens e ignora status", () => {
  const p = { entry: [{ changes: [{ value: { contacts: [{ wa_id: PROF, profile: { name: "Maria" } }], messages: [{ id: "wamid.1", from: PROF, type: "text", text: { body: "oi" } }, { id: "wamid.2", from: PROF, type: "image" }], statuses: [{ id: "x" }] } }] }] };
  const r = parseWebhook(p);
  assert.equal(r.messages.length, 2);
  assert.equal(r.messages[0].text, "oi");
  assert.equal(r.messages[1].text, null);
});

test("telefone e protocolo: normalizacao e validacao", () => {
  assert.equal(normalizePhone("+55 (31) 8888-7777"), "5531988887777");
  assert.equal(normalizePhone("5531988887777"), "5531988887777");
  assert.equal(parseProtocolo(" empis-2026-00001 "), "EMPIS-2026-00001");
  assert.equal(parseProtocolo("EMPIS-26-1"), null);
});

test("mensagem de audio/imagem no meio do fluxo recebe aviso amigavel", async () => {
  const { wa, ctx, diz } = novoAmbiente();
  await diz(PROF, "oi"); await diz(PROF, "1"); await diz(PROF, "Maria da Silva");
  await handleIncoming(ctx, { wamid: "aud-1", from: PROF, type: "audio", text: null });
  assert.match(wa.ultima(PROF), /apenas mensagens de \*texto\*/);
});
