import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import worker from "../src/index.js";

const env = {
  WHATSAPP_TOKEN: "t", PHONE_NUMBER_ID: "1", APP_SECRET: "segredo", VERIFY_TOKEN: "meu-token",
  SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_KEY: "k",
};
const ctx = { waitUntil: () => {} };

test("webhook GET: verificacao da Meta aceita token correto e rejeita errado", async () => {
  const ok = await worker.fetch(new Request("https://w/webhook?hub.mode=subscribe&hub.verify_token=meu-token&hub.challenge=123"), env, ctx);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "123");
  const ruim = await worker.fetch(new Request("https://w/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123"), env, ctx);
  assert.equal(ruim.status, 403);
});

test("webhook POST: rejeita sem assinatura / assinatura falsa e aceita assinatura valida", async () => {
  const corpo = JSON.stringify({ entry: [] });
  const semAss = await worker.fetch(new Request("https://w/webhook", { method: "POST", body: corpo }), env, ctx);
  assert.equal(semAss.status, 401);
  const falsa = await worker.fetch(new Request("https://w/webhook", { method: "POST", body: corpo, headers: { "x-hub-signature-256": "sha256=00" } }), env, ctx);
  assert.equal(falsa.status, 401);
  const sig = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
  const ok = await worker.fetch(new Request("https://w/webhook", { method: "POST", body: corpo, headers: { "x-hub-signature-256": sig } }), env, ctx);
  assert.equal(ok.status, 200);
});

test("segredos faltando gera erro 500 claro; rotas desconhecidas 404", async () => {
  const r = await worker.fetch(new Request("https://w/webhook"), { ...env, APP_SECRET: "" }, ctx);
  assert.equal(r.status, 500);
  assert.equal((await worker.fetch(new Request("https://w/outra"), env, ctx)).status, 404);
  assert.equal((await worker.fetch(new Request("https://w/"), env, ctx)).status, 200);
});
