import { test } from "node:test";
import assert from "node:assert/strict";
import {
  remoteOriginPattern, errorKeyOf, errorDetailOf, isKnownError, isRetryableError,
  createSSEParser, deltaContentOf
} from "../lib/utils.js";

test("remoteOriginPattern : localhost / 127.0.0.1 ne nécessitent aucune permission", () => {
  assert.equal(remoteOriginPattern("http://localhost:11434/v1"), null);
  assert.equal(remoteOriginPattern("http://127.0.0.1:1234/v1/"), null);
});

test("remoteOriginPattern : IP Tailscale, LAN, MagicDNS → origine exacte", () => {
  assert.equal(remoteOriginPattern("http://100.101.102.103:11434/v1"), "http://100.101.102.103:11434/*");
  assert.equal(remoteOriginPattern("https://serveur.tail1234.ts.net/v1"), "https://serveur.tail1234.ts.net/*");
  assert.equal(remoteOriginPattern("http://192.168.1.50:8080/v1"), "http://192.168.1.50:8080/*");
});

test("remoteOriginPattern : URL invalide ou protocole non http(s) → null", () => {
  assert.equal(remoteOriginPattern("ftp://foo/v1"), null);
  assert.equal(remoteOriginPattern("pas une url"), null);
  assert.equal(remoteOriginPattern(""), null);
});

test("errorKeyOf / errorDetailOf extraient le code et le détail", () => {
  assert.equal(errorKeyOf("API_KEY_INVALID: HTTP 401 — bad key"), "API_KEY_INVALID");
  assert.equal(errorDetailOf("API_KEY_INVALID: HTTP 401 — bad key"), "HTTP 401 — bad key");
  assert.equal(errorKeyOf("TIMEOUT"), "TIMEOUT");
  assert.equal(errorDetailOf("TIMEOUT"), "");
});

test("isKnownError reconnaît les codes même suivis d'un détail", () => {
  assert.ok(isKnownError(new Error("SERVER_ERROR: HTTP 502 — bad gateway")));
  assert.ok(isKnownError(new Error("CGU_NOT_ACCEPTED")));
  assert.ok(!isKnownError(new Error("Failed to fetch")));
});

test("isRetryableError : 429 / 5xx / réseau uniquement", () => {
  assert.ok(isRetryableError(new Error("RATE_LIMITED: HTTP 429")));
  assert.ok(isRetryableError(new Error("SERVER_ERROR: HTTP 503")));
  assert.ok(isRetryableError(new Error("NETWORK_ERROR: Failed to fetch")));
  assert.ok(!isRetryableError(new Error("TIMEOUT")));
  assert.ok(!isRetryableError(new Error("API_KEY_INVALID: HTTP 401")));
});

test("createSSEParser : lignes partielles, CRLF, commentaires et [DONE]", () => {
  const p = createSSEParser();
  assert.deepEqual(p.push('data: {"a":1}\n\n: keep-alive\ndata: {"b'), ['{"a":1}']);
  assert.deepEqual(p.push('":2}\r\ndata: [DONE]\n'), ['{"b":2}', "[DONE]"]);
  assert.deepEqual(p.push("data: tail"), []);
  assert.deepEqual(p.flush(), ["tail"]);
});

test("deltaContentOf : delta de streaming et message complet", () => {
  assert.deepEqual(deltaContentOf({ choices: [{ delta: { content: "Bon" } }] }), { text: "Bon", finishReason: null });
  assert.deepEqual(deltaContentOf({ choices: [{ delta: { reasoning_content: "…" }, finish_reason: "length" }] }), { text: "", finishReason: "length" });
  assert.deepEqual(deltaContentOf({ choices: [{ message: { content: "Tout" }, finish_reason: "stop" }] }), { text: "Tout", finishReason: "stop" });
  assert.deepEqual(deltaContentOf({}), { text: "", finishReason: null });
});

test("resolveModelId : identifiant exact, casse, nom d'affichage OpenRouter, variantes :free", async () => {
  const { resolveModelId, normalizeModelName } = await import("../lib/utils.js");
  const catalog = [
    { id: "inclusionai/ling-3.0-flash-vl", name: "inclusionAI: Ling 3.0 Flash VL" },
    { id: "inclusionai/ling-3.0-flash-vl:free", name: "inclusionAI: Ling 3.0 Flash VL (free)" },
    { id: "mistralai/mistral-small-3.2-24b-instruct", name: "Mistral: Mistral Small 3.2 24B" },
    "gpt-oss-120b"
  ];
  assert.equal(resolveModelId("inclusionai/ling-3.0-flash-vl", catalog), "inclusionai/ling-3.0-flash-vl");
  assert.equal(resolveModelId("Inclusionai/Ling-3.0-Flash-VL", catalog), "inclusionai/ling-3.0-flash-vl");
  assert.equal(resolveModelId("Ling 3.0 Flash VL", catalog), "inclusionai/ling-3.0-flash-vl", "nom d'affichage sans préfixe éditeur");
  assert.equal(resolveModelId("inclusionAI: Ling 3.0 Flash VL (free)", catalog), "inclusionai/ling-3.0-flash-vl:free");
  assert.equal(resolveModelId("Mistral Small 3.2 24B", catalog), "mistralai/mistral-small-3.2-24b-instruct");
  assert.equal(resolveModelId("gpt-oss-120b", catalog), "gpt-oss-120b", "catalogue de simples chaînes");
  assert.equal(resolveModelId("Modèle inconnu", catalog), null);
  assert.equal(resolveModelId("", catalog), null);
  assert.equal(normalizeModelName("inclusionAI: Ling 3.0 Flash VL (free)"), "ling 3 0 flash vl");
});
