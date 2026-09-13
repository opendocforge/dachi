// ============================================================================
// background.js — Service Worker (Manifest V3, mode module)
// Menu contextuel, raccourci clavier, pipeline anonymisation → API → ré-identification,
// streaming vers le content script, tests de connexion, liste des modèles.
// Les clés API ne quittent jamais le Service Worker ; la table de
// correspondance placeholder → valeur d'origine ne quitte jamais le poste.
// ============================================================================

import { anonymizeText, rehydrateText, parseAcronymList } from "./lib/anonymizer.js";
import { MENU_ITEMS } from "./lib/menu-defaults.js";
import { loadSettings, DEFAULT_SETTINGS } from "./lib/settings.js";
import { loadMenuConfig, resolveMenuItems, isMenuKey } from "./lib/menu-store.js";
import {
  remoteOriginPattern, isKnownError, isRetryableError, errorKeyOf,
  createSSEParser, deltaContentOf, sleep, resolveModelId, composeFormText, pickReasoningEffort
} from "./lib/utils.js";

// Modèles Scaleway acceptant reasoning_effort (doc « Supported models »,
// sept. 2026). Les autres (Mistral Small, Llama, Gemma 3, Nemo…) n'acceptent
// pas le paramètre : on ne l'envoie pas.
const SCALEWAY_REASONING = [
  { re: /^(gemma-4|qwen3\.[56]|qwen3-235b-a22b-thinking)/i, efforts: ["none", "low", "medium", "high"] },
  { re: /^(mistral-medium-3\.5|mistral-large-3)/i, efforts: ["none", "high"] },
  { re: /^(deepseek-v4|glm-|minimax)/i, efforts: ["none", "low", "high", "max"] },
  { re: /^gpt-oss/i, efforts: ["low", "medium", "high"] },
  { re: /magistral/i, efforts: ["low", "medium", "high"] }
];
function scalewayReasoningEfforts(model) {
  const hit = SCALEWAY_REASONING.find(r => r.re.test(model || ""));
  return hit ? hit.efforts : null;
}

const ROOT_MENU_ID = "assistant_medecin_root";
const REOPEN_MENU_ID = "dachi_reopen_last";
const SEPARATOR_MENU_ID = "dachi_separator";
const STREAM_THROTTLE_MS = 80;

// ---------------------------------------------------------------------------
// 1. Menu contextuel
// ---------------------------------------------------------------------------
let buildMenusPromise = null;
function buildMenus() {
  // Chaîner les appels pour éviter tout doublon (pas de concurrence)
  buildMenusPromise = (buildMenusPromise || Promise.resolve()).then(() => _buildMenus());
  return buildMenusPromise;
}

const createdMenuIds = new Set();

function createOrUpdateMenu(props) {
  return new Promise(resolve => {
    const { id, ...rest } = props;
    const done = () => { void chrome.runtime.lastError; resolve(); };
    try {
      if (createdMenuIds.has(id)) {
        chrome.contextMenus.update(id, rest, done);
      } else {
        createdMenuIds.add(id);
        chrome.contextMenus.create(props, done);
      }
    } catch (_e) {
      resolve();
    }
  });
}

async function _buildMenus() {
  const config = await loadMenuConfig();
  const items = resolveMenuItems(MENU_ITEMS, config);

  await new Promise(resolve => chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    createdMenuIds.clear();
    resolve();
  }));

  await createOrUpdateMenu({ id: ROOT_MENU_ID, title: "Dachi", contexts: ["selection"] });

  for (const item of items) {
    if (!item.enabled) continue;
    await createOrUpdateMenu({
      id: item.id,
      parentId: ROOT_MENU_ID,
      title: item.title,
      contexts: ["selection"]
    });
  }

  await createOrUpdateMenu({ id: SEPARATOR_MENU_ID, parentId: ROOT_MENU_ID, type: "separator", contexts: ["selection"] });
  await createOrUpdateMenu({
    id: REOPEN_MENU_ID,
    parentId: ROOT_MENU_ID,
    title: "↩ Rouvrir le dernier résultat",
    contexts: ["selection"]
  });
}

chrome.runtime.onInstalled.addListener(() => buildMenus());
chrome.runtime.onStartup.addListener(() => buildMenus());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && Object.keys(changes).some(isMenuKey)) buildMenus();
});

// ---------------------------------------------------------------------------
// 2. Communication avec le content script
// ---------------------------------------------------------------------------

/** Envoie un message à l'onglet sans jamais lever (receveur absent → ignoré). */
function safeSend(tabId, msg) {
  try {
    const p = chrome.tabs.sendMessage(tabId, msg);
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_e) { /* ignore */ }
}

async function sendAndWait(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (_e) {
    return undefined;
  }
}

/**
 * Injecte CSS + content script puis attend qu'il réponde au ping
 * (remplace l'ancienne attente fixe de 150 ms). Lève NO_CONTENT_SCRIPT si
 * l'onglet est inaccessible (chrome://, Web Store, PDF…).
 */
let contentCssPromise = null;
function getContentCss() {
  if (!contentCssPromise) {
    contentCssPromise = fetch(chrome.runtime.getURL("content.css")).then(r => r.text()).catch(() => "");
  }
  return contentCssPromise;
}

async function ensureContentScript(tabId) {
  try {
    // Le CSS est déposé dans le monde isolé (globalThis partagé entre les
    // executeScript de l'extension) : content.js le place dans son Shadow DOM
    // fermé, hors de portée des scripts de la page.
    const css = await getContentCss();
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (cssText) => { globalThis.__DACHI_CSS = cssText; },
      args: [css]
    });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (e) {
    throw new Error(`NO_CONTENT_SCRIPT: ${e.message}`);
  }
  for (let i = 0; i < 20; i++) {
    const res = await sendAndWait(tabId, { action: "ping" });
    if (res && res.pong) return;
    await sleep(50);
  }
  throw new Error("NO_CONTENT_SCRIPT: le script de page ne répond pas");
}

/** Texte sélectionné avec ses retours à la ligne (info.selectionText les aplatit). */
async function getSelectionFromTab(tabId, fallback) {
  const res = await sendAndWait(tabId, { action: "getSelection" });
  const text = res && typeof res.text === "string" ? res.text : "";
  return text.trim() ? text : (fallback || "");
}

// ---------------------------------------------------------------------------
// 3. Résolution d'une action (défaut + override, ou perso)
// ---------------------------------------------------------------------------
async function resolveMenuItem(menuId) {
  const config = await loadMenuConfig();
  return resolveMenuItems(MENU_ITEMS, config).find(m => m.id === menuId) || null;
}

// ---------------------------------------------------------------------------
// 4. Pipeline : sélection → anonymisation → (aperçu) → API → ré-identification
// ---------------------------------------------------------------------------

/**
 * Point d'entrée commun (menu contextuel, raccourci clavier, questions validées).
 * `answers` : réponses aux questions de l'action (si elle en pose) ;
 * `sourceText` : texte sélectionné conservé entre l'affichage des questions
 * et leur validation.
 */
async function startAction({ tabId, menuId, fallbackText, answers, sourceText }) {
  let item = null;
  try {
    // Démarrage en parallèle : résolution de l'action, injection du script de
    // page et lecture des réglages sont indépendants (≈ 100–200 ms gagnés).
    const [resolved, , settingsEarly] = await Promise.all([resolveMenuItem(menuId), ensureContentScript(tabId), loadSettings()]);
    item = resolved;
    if (!item) return;
    let text = typeof sourceText === "string" ? sourceText : await getSelectionFromTab(tabId, fallbackText);
    if (!text.trim()) {
      safeSend(tabId, { phase: "toast", message: "Sélectionnez d'abord du texte.", isError: true });
      return;
    }

    // Action avec questions : on les pose d'abord au médecin, puis on revient
    // ici avec `answers` (message submitForm du content script).
    const form = item.form && Array.isArray(item.form.fields) && item.form.fields.length ? item.form : null;
    let formUsed = false;
    if (form && !answers) {
      safeSend(tabId, { phase: "form", title: item.title, form, request: { menuId: item.id, sourceText: text } });
      return;
    }
    if (form && answers) {
      text = composeFormText(form, text, answers);
      formUsed = true;
    }

    const settings = settingsEarly;
    if (settings.cguAccepted !== "1.0") {
      chrome.runtime.openOptionsPage();
      throw new Error("CGU_NOT_ACCEPTED");
    }

    // Anonymisation locale
    let anonymization = { enabled: false, count: 0, replacements: {} };
    let processed = text;
    let map = {};
    if (settings.anonymizeEnabled) {
      const r = anonymizeText(text, { customAcronyms: parseAcronymList(settings.customAcronyms) });
      processed = r.text;
      map = r.map;
      anonymization = { enabled: true, count: r.count, replacements: r.replacements };
    }

    const request = { menuId: item.id, title: item.title, text: processed, anonymization, map, formUsed };

    if (settings.confirmBeforeSend) {
      // L'utilisateur relit / corrige le texte anonymisé, puis renvoie `runAction`.
      safeSend(tabId, { phase: "preview", title: item.title, request });
      return;
    }

    await runGeneration({ tabId, item, request, settings });
  } catch (error) {
    safeSend(tabId, { phase: "error", title: item ? item.title : "Dachi", error: error.message });
  }
}

/**
 * Appel API + streaming + ré-identification. `request` = { menuId, title, text
 * (déjà anonymisé), anonymization, map, extraInstruction?, previousResult? }.
 */
async function runGeneration({ tabId, item, request, settings }) {
  try {
    settings = settings || await loadSettings();
    item = item || await resolveMenuItem(request.menuId);
    if (!item) throw new Error("API_ERROR: action inconnue");

    safeSend(tabId, {
      phase: "loading",
      title: item.title,
      inputChars: (request.text || "").length,
      isLocal: settings.provider === "local"
    });

    const map = request.map || {};
    const rehydrate = (text) => settings.rehydrateEnabled ? rehydrateText(text, map) : { text, restored: 0 };

    // Streaming : on pousse le texte partiel (ré-identifié) à intervalle régulier
    let lastPush = 0;
    let pending = null;
    const t0 = Date.now();
    let tFirst = 0;
    let reasoningChars = 0;
    const onChunk = (partial, meta) => {
      if (meta && meta.reasoningChars != null) reasoningChars = meta.reasoningChars;
      if (partial && !tFirst) tFirst = Date.now();
      const now = Date.now();
      if (now - lastPush >= STREAM_THROTTLE_MS) {
        lastPush = now;
        if (pending) { clearTimeout(pending); pending = null; }
        safeSend(tabId, { phase: "stream", title: item.title, partial: rehydrate(partial).text, reasoningChars });
      } else if (!pending) {
        pending = setTimeout(() => { pending = null; onChunk(partial, meta); }, STREAM_THROTTLE_MS);
      }
    };

    const { text, finishReason, usage } = await callAI(settings, item, request, settings.streamEnabled ? onChunk : null);
    const tEnd = Date.now();
    const timing = {
      ttftMs: (tFirst || tEnd) - t0,
      totalMs: tEnd - t0,
      outputChars: (text || "").length,
      reasoningChars,
      model: (await providerRequest(settings)).model,
      provider: settings.provider
    };
    if (pending) { clearTimeout(pending); pending = null; }

    if (!text || !text.trim()) throw new Error("EMPTY_RESPONSE");

    const final = rehydrate(text);
    safeSend(tabId, {
      phase: "result",
      title: item.title,
      result: final.text,
      anonymization: request.anonymization,
      rehydration: { enabled: !!settings.rehydrateEnabled, restored: final.restored },
      truncated: finishReason === "length",
      usage: usageSummary(usage, settings.maxTokens || DEFAULT_SETTINGS.maxTokens),
      timing,
      request: { menuId: request.menuId, title: item.title, text: request.text, anonymization: request.anonymization, map, formUsed: !!request.formUsed }
    });
  } catch (error) {
    safeSend(tabId, { phase: "error", title: item ? item.title : "Dachi", error: error.message });
  }
}

// ---------------------------------------------------------------------------
// 5. Construction des messages et appel fournisseur
// ---------------------------------------------------------------------------
function buildMessages(settings, item, request) {
  let system = item.prompt;
  if (settings.doctorContext && settings.doctorContext.trim()) {
    system = `Contexte du médecin : ${settings.doctorContext.trim()}\n\n${system}`;
  }
  if (request.formUsed) {
    system += "\n\nLe message du médecin contient deux blocs : « ### Données sources » (le texte qu'il a sélectionné) et « ### Consignes du médecin » (ses réponses à tes questions). Respecte strictement les consignes et n'utilise que les faits présents dans ces deux blocs.";
  }
  const extra = (request.extraInstruction || "").trim();
  if (extra && !request.previousResult) {
    system += `\n\nConsigne supplémentaire du médecin : ${extra}`;
  }

  const messages = [{ role: "system", content: system }];
  const limit = Number.isFinite(settings.fewShotLimit) ? settings.fewShotLimit : 4;
  for (const ex of (item.examples || []).slice(0, Math.max(0, limit))) {
    if (ex.input && ex.output) {
      messages.push({ role: "user", content: ex.input });
      messages.push({ role: "assistant", content: ex.output });
    }
  }
  messages.push({ role: "user", content: request.text });

  // Affiner : on repart de la réponse précédente
  if (extra && request.previousResult) {
    messages.push({ role: "assistant", content: request.previousResult });
    messages.push({ role: "user", content: `Reprends ta réponse précédente en appliquant cette consigne : ${extra}. Renvoie uniquement le texte final, sans commentaire.` });
  }
  return messages;
}

/** Paramètres de requête selon le fournisseur (vérifie la configuration). */
async function providerRequest(settings) {
  switch (settings.provider) {
    case "scaleway": {
      if (!settings.scalewayApiKey) throw new Error("NO_API_KEY_SCALEWAY");
      if (!settings.scalewayProjectId) throw new Error("NO_PROJECT_ID_SCALEWAY");
      if (!settings.scalewayModel) throw new Error("NO_MODEL_SCALEWAY");
      return {
        url: `https://api.scaleway.ai/${settings.scalewayProjectId}/v1/chat/completions`,
        modelsUrl: `https://api.scaleway.ai/${settings.scalewayProjectId}/v1/models`,
        headers: { "Authorization": `Bearer ${settings.scalewayApiKey}`, "Content-Type": "application/json" },
        model: settings.scalewayModel,
        maxTokens: settings.maxTokens || DEFAULT_SETTINGS.maxTokens,
        timeoutMs: 45000,
        firstByteTimeoutMs: 90000,
        isLocal: false,
        // Modèles à raisonnement (gpt-oss, *-thinking, magistral) : effort réduit,
        // sinon le budget de réponse part en raisonnement interne.
        adaptBody: (b) => {
          const effort = pickReasoningEffort(settings.reasoningEffort || "auto", scalewayReasoningEfforts(b.model));
          return effort ? { ...b, reasoning_effort: effort } : b;
        }
      };
    }
    case "local": {
      if (!settings.localServerUrl) throw new Error("NO_LOCAL_URL");
      if (!settings.localModel) throw new Error("NO_LOCAL_MODEL");
      const base = settings.localServerUrl.replace(/\/+$/, "");
      if (!(await hasRemoteOriginPermission(base))) throw new Error("LOCAL_PERMISSION_DENIED");
      const headers = { "Content-Type": "application/json" };
      if (settings.localRequireKey && settings.localApiKey) headers["Authorization"] = `Bearer ${settings.localApiKey}`;
      return {
        url: `${base}/chat/completions`,
        modelsUrl: `${base}/models`,
        headers,
        model: settings.localModel,
        maxTokens: settings.maxTokens || DEFAULT_SETTINGS.maxTokens,
        timeoutMs: 60000,
        // Un modèle local sur CPU peut mettre plusieurs minutes à lire un long
        // texte avant d'émettre le premier jeton : délai dédié, plus généreux.
        firstByteTimeoutMs: 270000,   // sous la limite dure de 5 min par requête du Service Worker
        isLocal: true
      };
    }
    case "openai": {
      if (!settings.apiKey) throw new Error("NO_API_KEY");
      return {
        url: "https://api.openai.com/v1/chat/completions",
        modelsUrl: "https://api.openai.com/v1/models",
        headers: { "Authorization": `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
        model: settings.model || DEFAULT_SETTINGS.model,
        maxTokens: settings.maxTokens || DEFAULT_SETTINGS.maxTokens,
        timeoutMs: 45000,
        firstByteTimeoutMs: 90000,
        isLocal: false,
        usageInStream: true,
        adaptBody: (b) => adaptOpenAIBody(b, settings.reasoningEffort || "auto")
      };
    }
    case "openrouter": {
      if (!settings.openrouterApiKey) throw new Error("NO_API_KEY_OPENROUTER");
      if (!settings.openrouterModel) throw new Error("NO_MODEL_OPENROUTER");
      const openrouterModel = await resolveOpenRouterModel(settings.openrouterModel);
      return {
        url: "https://openrouter.ai/api/v1/chat/completions",
        modelsUrl: "https://openrouter.ai/api/v1/models",
        headers: {
          "Authorization": `Bearer ${settings.openrouterApiKey}`,
          "Content-Type": "application/json",
          // Attribution facultative dans le tableau de bord OpenRouter
          "X-Title": "Dachi"
        },
        model: openrouterModel,
        maxTokens: settings.maxTokens || DEFAULT_SETTINGS.maxTokens,
        timeoutMs: 60000,
        firstByteTimeoutMs: 120000,
        isLocal: false,
        // Refuse le routage vers les fournisseurs qui conservent / entraînent sur les données
        extraBody: {
          provider: { data_collection: "deny" },
          reasoning: (settings.reasoningEffort || "auto") === "auto" || settings.reasoningEffort === "none"
            ? { enabled: false }
            : { effort: settings.reasoningEffort }
        },
        // Les fournisseurs OpenAI-compatibles renvoient l'usage en fin de flux si demandé
        usageInStream: true
      };
    }
    default:
      throw new Error("NO_PROVIDER");
  }
}

/**
 * Corps de requête pour l'API OpenAI :
 * - `max_completion_tokens` remplace `max_tokens` (obligatoire sur GPT-5 / o-series,
 *   accepté par tous les modèles récents) ;
 * - les modèles à raisonnement refusent `temperature` ≠ 1 → on l'omet et on
 *   demande un raisonnement faible (rapide, économique, suffisant pour rédiger).
 */
function adaptOpenAIBody(body, requested = "auto") {
  const { max_tokens, temperature, ...rest } = body;
  const isReasoning = /^(o\d|gpt-[5-9])/i.test(body.model) && !/chat/i.test(body.model);
  let effort = requested === "auto" || requested === "none"
    ? (/^gpt-5/i.test(body.model) ? "minimal" : "low")   // « minimal » n'existe que sur GPT-5+, « none » n'est pas universel
    : requested;
  return {
    ...rest,
    max_completion_tokens: max_tokens,
    ...(isReasoning ? { reasoning_effort: effort } : { temperature })
  };
}

async function callAI(settings, item, request, onChunk) {
  const req = await providerRequest(settings);
  const body = {
    model: req.model,
    temperature: settings.temperature,
    max_tokens: req.maxTokens,
    messages: buildMessages(settings, item, request),
    ...(req.extraBody || {})
  };
  const finalBody = req.adaptBody ? req.adaptBody(body) : body;

  // Une seule nouvelle tentative, uniquement si rien n'a encore été reçu
  let received = false;
  const wrappedChunk = onChunk ? (t) => { received = true; onChunk(t); } : null;
  try {
    return await chatCompletion({ ...req, body: finalBody, onChunk: wrappedChunk });
  } catch (error) {
    if (!received && isRetryableError(error)) {
      await sleep(1500);
      return await chatCompletion({ ...req, body: finalBody, onChunk: wrappedChunk });
    }
    throw error;
  }
}

/**
 * Appel chat/completions générique (OpenAI-compatible) avec streaming SSE.
 * Le timeout est un timeout d'inactivité : il est réarmé à chaque chunk reçu.
 */
async function chatCompletion({ url, headers, body, timeoutMs, firstByteTimeoutMs, isLocal, onChunk, usageInStream }) {
  const controller = new AbortController();
  // Avant le premier octet : délai « premier jeton » (lecture du prompt) ;
  // ensuite : délai d'inactivité réarmé à chaque chunk.
  let timer = setTimeout(() => controller.abort(), firstByteTimeoutMs || timeoutMs);
  const rearm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), timeoutMs); };
  // Chrome arrête le Service Worker après 30 s sans appel d'API d'extension :
  // pendant la lecture d'un long prompt (aucun chunk reçu), un appel anodin
  // toutes les 20 s le maintient en vie. Limite dure : 5 min par requête.
  const keepAlive = setInterval(() => { try { chrome.runtime.getPlatformInfo().catch(() => {}); } catch (_) {} }, 20000);
  const stream = typeof onChunk === "function";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(stream
        ? { ...body, stream: true, ...(usageInStream ? { stream_options: { include_usage: true } } : {}) }
        : body),
      signal: controller.signal
    });

    if (!response.ok) await throwHttpError(response);

    const ctype = response.headers.get("content-type") || "";
    if (stream && ctype.includes("text/event-stream") && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSSEParser();
      let text = "";
      let finishReason = null;
      let usage = null;
      let reasoningChars = 0;
      const consume = (events) => {
        for (const data of events) {
          if (data === "[DONE]") continue;
          let payload;
          try { payload = JSON.parse(data); } catch (_) { continue; }
          if (payload && payload.usage) usage = payload.usage;
          const { text: piece, reasoning, finishReason: fr } = deltaContentOf(payload);
          if (fr) finishReason = fr;
          if (reasoning) { reasoningChars += reasoning.length; if (!text) onChunk("", { reasoningChars }); }
          if (piece) { text += piece; onChunk(text, { reasoningChars }); }
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        rearm();
        consume(parser.push(decoder.decode(value, { stream: true })));
      }
      consume(parser.flush());
      return { text, finishReason, usage };
    }

    // Réponse JSON classique (serveur sans streaming, ou streaming désactivé)
    const data = await response.json();
    const choice = data.choices && data.choices[0];
    const msg = choice && choice.message;
    const text = (msg && (msg.content || msg.reasoning_content || msg.reasoning)) || "";
    return { text, finishReason: (choice && choice.finish_reason) || null, usage: data.usage || null };
  } catch (error) {
    throw normalizeFetchError(error, isLocal);
  } finally {
    clearTimeout(timer);
    clearInterval(keepAlive);
  }
}

/** Résumé d'usage pour le bandeau « réponse tronquée » : jetons générés / plafond / raisonnement. */
function usageSummary(usage, maxTokens) {
  if (!usage) return { maxTokens };
  const completion = Number(usage.completion_tokens) || 0;
  const details = usage.completion_tokens_details || {};
  const reasoning = Number(details.reasoning_tokens) || 0;
  return { maxTokens, completion, reasoning };
}

async function readErrorBody(response) {
  try {
    const data = await response.json();
    return data.error?.message || data.message || data.detail || JSON.stringify(data);
  } catch (_) {
    try { return await response.text(); } catch (_) { return ""; }
  }
}

async function throwHttpError(response) {
  const status = response.status;
  const msg = (await readErrorBody(response)).slice(0, 300);
  if (status === 401 || status === 403) throw new Error(`API_KEY_INVALID: HTTP ${status} — ${msg}`);
  if (status === 400 && /context|too (long|many tokens)|maximum.*(length|tokens)|token limit|exceeds/i.test(msg)) {
    throw new Error(`CONTEXT_TOO_LONG: HTTP 400 — ${msg}`);
  }
  if (status === 413) throw new Error(`CONTEXT_TOO_LONG: HTTP 413 — ${msg}`);
  if (status === 429) throw new Error(`RATE_LIMITED: HTTP 429 — ${msg}`);
  if (status >= 500) throw new Error(`SERVER_ERROR: HTTP ${status} — ${msg}`);
  throw new Error(`API_ERROR: HTTP ${status} — ${msg}`);
}

function normalizeFetchError(error, isLocal) {
  if (error && error.name === "AbortError") return new Error("TIMEOUT");
  if (isKnownError(error)) return error;
  if (isLocal && error && error.name === "TypeError") return new Error("LOCAL_CONNECTION_REFUSED");
  return new Error(`NETWORK_ERROR: ${error && error.message ? error.message : "inconnu"}`);
}

/**
 * OpenRouter n'accepte que des identifiants « fournisseur/modèle ». Si
 * l'utilisateur a saisi un nom d'affichage (« Ling 3.0 Flash VL »), on le
 * résout via le catalogue mis en cache par la page d'options.
 */
async function resolveOpenRouterModel(input) {
  const value = String(input || "").trim();
  if (value.includes("/")) return value;
  try {
    const { modelCache_openrouter: cache } = await chrome.storage.local.get("modelCache_openrouter");
    return resolveModelId(value, cache) || value;
  } catch (_) {
    return value;
  }
}

async function hasRemoteOriginPermission(urlString) {
  const pattern = remoteOriginPattern(urlString);
  if (!pattern) return true;
  try {
    return await chrome.permissions.contains({ origins: [pattern] });
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 6. Événements : menu contextuel, raccourci clavier, icône
// ---------------------------------------------------------------------------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || tab.id == null) return;
  if (info.menuItemId === ROOT_MENU_ID || info.menuItemId === SEPARATOR_MENU_ID) return;

  if (info.menuItemId === REOPEN_MENU_ID) {
    try {
      await ensureContentScript(tab.id);
      safeSend(tab.id, { phase: "reopen" });
    } catch (_) { /* onglet inaccessible */ }
    return;
  }

  if (!info.selectionText) return;
  await startAction({ tabId: tab.id, menuId: String(info.menuItemId), fallbackText: info.selectionText });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "quick-action") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;
  const settings = await loadSettings();
  await startAction({ tabId: tab.id, menuId: settings.quickActionId || DEFAULT_SETTINGS.quickActionId, fallbackText: "" });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// ---------------------------------------------------------------------------
// 7. Messages (content script + page d'options)
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const respond = (promise) => {
    promise.then(sendResponse).catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  };

  switch (message && message.action) {
    case "wake":
      // Réveil anticipé (clic droit) : le SW est déjà démarré quand l'action arrive
      sendResponse({ ok: true });
      return false;

    case "openOptions":
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return false;

    case "submitForm": {
      // Formulaire validé dans la modale → pipeline normal avec les consignes
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null) { sendResponse({ ok: false }); return false; }
      startAction({ tabId, menuId: message.menuId, sourceText: message.sourceText, answers: message.answers || {} });
      sendResponse({ ok: true });
      return false;
    }

    case "runAction": {
      // Depuis le content script : aperçu validé, régénérer, affiner
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null) { sendResponse({ ok: false }); return false; }
      runGeneration({ tabId, item: null, request: message.request, settings: null });
      sendResponse({ ok: true });
      return false;
    }

    case "testConnection":
      return respond(testLocalConnection(message.config));

    case "testScaleway":
      return respond(testChatConnection("scaleway", message.config));

    case "testOpenRouter":
      return respond(testChatConnection("openrouter", message.config));

    case "listModels":
      return respond(listModels(message.provider, message.config));

    case "rebuildMenus":
      return respond(buildMenus().then(() => ({ ok: true })));

    default:
      return false;
  }
});

// ---------------------------------------------------------------------------
// 8. Tests de connexion et liste des modèles (page d'options)
// ---------------------------------------------------------------------------
/** Test d'un fournisseur distant (Scaleway, OpenRouter) : mini chat completion. */
async function testChatConnection(provider, config) {
  const settings = { ...DEFAULT_SETTINGS, ...config, provider };
  let req;
  try { req = await providerRequest(settings); } catch (e) { return { ok: false, error: errorLabel(e.message) }; }

  try {
    const { text } = await chatCompletion({
      ...req,
      timeoutMs: 20000,
      body: (req.adaptBody || ((b) => b))({
        model: req.model, temperature: 0.1, max_tokens: 20,
        messages: [{ role: "system", content: "Réponds simplement 'OK'." }, { role: "user", content: "ping" }],
        ...(req.extraBody || {})
      })
    });
    if (text) return { ok: true, info: `Connexion réussie — modèle « ${req.model} » a répondu « ${String(text).trim().slice(0, 60)} »` };
    return { ok: false, error: "Connexion OK mais réponse vide (modèle inadapté ?)" };
  } catch (e) {
    let label = errorLabel(e.message);
    if (/not a valid model/i.test(e.message)) {
      label += " — utilisez l'identifiant « fournisseur/modèle » (cliquez sur « Actualiser » puis choisissez dans la liste).";
    }
    return { ok: false, error: label };
  }
}

async function testLocalConnection(config) {
  const settings = { ...DEFAULT_SETTINGS, provider: "local", ...config, localModel: config.localModel || "x" };
  let req;
  try { req = await providerRequest(settings); } catch (e) { return { ok: false, error: errorLabel(e.message) }; }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(req.modelsUrl, { method: "GET", headers: req.headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) return { ok: true };
    return { ok: false, error: `Erreur HTTP ${response.status}` };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") return { ok: false, error: "Délai dépassé (10 s)" };
    return { ok: false, error: "Le serveur ne répond pas. Vérifiez qu'Ollama / LM Studio est bien lancé et accessible." };
  }
}

/** GET /v1/models du fournisseur → liste d'identifiants de modèles. */
async function listModels(provider, config) {
  const settings = { ...DEFAULT_SETTINGS, provider, ...config };
  // Le modèle n'est pas requis pour lister ; on neutralise ces contrôles
  if (provider === "scaleway") settings.scalewayModel = settings.scalewayModel || "x";
  if (provider === "local") settings.localModel = settings.localModel || "x";
  if (provider === "openrouter") settings.openrouterModel = settings.openrouterModel || "x";
  let req;
  try { req = await providerRequest(settings); } catch (e) { return { ok: false, error: errorLabel(e.message) }; }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(req.modelsUrl, { method: "GET", headers: req.headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) await throwHttpError(response);
    const data = await response.json();
    const list = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : []);
    const models = list
      .map(m => ({ id: m.id || m.model || m.name, name: m.name || m.id || m.model }))
      .filter(m => m.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    return { ok: true, models };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: errorLabel(normalizeFetchError(error, req.isLocal).message) };
  }
}

const ERROR_LABELS = {
  NO_API_KEY: "Clé API OpenAI manquante.",
  NO_API_KEY_SCALEWAY: "Clé API Scaleway manquante.",
  NO_API_KEY_OPENROUTER: "Clé API OpenRouter manquante.",
  NO_MODEL_OPENROUTER: "Modèle OpenRouter non renseigné.",
  NO_PROJECT_ID_SCALEWAY: "ID de projet Scaleway manquant.",
  NO_MODEL_SCALEWAY: "Modèle Scaleway non renseigné.",
  NO_LOCAL_URL: "URL du serveur manquante.",
  NO_LOCAL_MODEL: "Nom du modèle manquant.",
  LOCAL_PERMISSION_DENIED: "Autorisation Chrome manquante pour cette adresse — cliquez à nouveau pour l'accorder.",
  LOCAL_CONNECTION_REFUSED: "Le serveur ne répond pas.",
  API_KEY_INVALID: "Clé API refusée.",
  API_ERROR: "Le fournisseur a refusé la requête.",
  RATE_LIMITED: "Limite de requêtes atteinte.",
  SERVER_ERROR: "Erreur côté serveur.",
  TIMEOUT: "Délai dépassé.",
  NETWORK_ERROR: "Erreur réseau."
};

function errorLabel(message) {
  const key = errorKeyOf(message);
  const label = ERROR_LABELS[key];
  const detail = String(message).slice(key.length).replace(/^:\s*/, "");
  if (!label) return message;
  return detail ? `${label} (${detail})` : label;
}
