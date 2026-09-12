// ============================================================================
// lib/utils.js — Helpers purs partagés (Service Worker, page d'options, tests).
// ============================================================================

/**
 * Match pattern d'origine à autoriser pour joindre `urlString`, ou null si
 * l'URL est déjà couverte par host_permissions (localhost / 127.0.0.1) ou
 * invalide. Permet un serveur distant (LAN, Tailscale, VPN) via
 * optional_host_permissions sans élargir les permissions par défaut.
 */
export function remoteOriginPattern(urlString) {
  let u;
  try { u = new URL(urlString); } catch (_) { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return null;
  return `${u.origin}/*`;
}

/**
 * Codes d'erreur métier. Un message d'erreur est de la forme
 * "CODE" ou "CODE: détail lisible". errorKeyOf() en extrait le code.
 */
export const ERROR_CODES = new Set([
  "NO_API_KEY", "NO_API_KEY_SCALEWAY", "NO_API_KEY_OPENROUTER", "NO_MODEL_OPENROUTER", "NO_PROJECT_ID_SCALEWAY", "NO_MODEL_SCALEWAY",
  "NO_LOCAL_URL", "NO_LOCAL_MODEL", "NO_PROVIDER", "API_KEY_INVALID", "API_ERROR",
  "RATE_LIMITED", "TIMEOUT", "NETWORK_ERROR", "SERVER_ERROR", "LOCAL_CONNECTION_REFUSED",
  "LOCAL_PERMISSION_DENIED", "CGU_NOT_ACCEPTED", "EMPTY_SELECTION", "NO_CONTENT_SCRIPT",
  "EMPTY_RESPONSE", "CONTEXT_TOO_LONG"
]);

export function errorKeyOf(message) {
  return String(message || "").split(":")[0].trim();
}

export function errorDetailOf(message) {
  const s = String(message || "");
  const i = s.indexOf(":");
  return i === -1 ? "" : s.slice(i + 1).trim();
}

export function isKnownError(error) {
  return ERROR_CODES.has(errorKeyOf(error && error.message));
}

/** Erreurs pour lesquelles une nouvelle tentative a du sens. */
export function isRetryableError(error) {
  const key = errorKeyOf(error && error.message);
  return key === "RATE_LIMITED" || key === "SERVER_ERROR" || key === "NETWORK_ERROR";
}

/**
 * Parseur incrémental de flux Server-Sent Events (format OpenAI `data: {...}`).
 * push(chunk) renvoie la liste des payloads `data:` complets reçus.
 */
export function createSSEParser() {
  let buffer = "";
  return {
    push(chunk) {
      buffer += chunk;
      const events = [];
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data) events.push(data);
      }
      return events;
    },
    flush() {
      const rest = buffer.trim();
      buffer = "";
      return rest.startsWith("data:") ? [rest.slice(5).trim()].filter(Boolean) : [];
    }
  };
}

/** Extrait le texte d'un delta de chat completion (streaming), reasoning exclu. */
export function deltaContentOf(payload) {
  const choice = payload && payload.choices && payload.choices[0];
  if (!choice) return { text: "", finishReason: null };
  const delta = choice.delta || choice.message || {};
  const text = typeof delta.content === "string" ? delta.content : "";
  return { text, finishReason: choice.finish_reason || null };
}

/**
 * Compose le texte envoyé à l'IA pour une action à formulaire :
 * le texte sélectionné (données sources) suivi des réponses du médecin
 * (consignes), champ par champ dans l'ordre du formulaire. Les champs vides
 * sont omis. Renvoie une chaîne prête à être anonymisée.
 */
export function composeFormText(form, sourceText, answers) {
  const lines = [];
  for (const f of (form && form.fields) || []) {
    const v = answers && answers[f.key] != null ? String(answers[f.key]).trim() : "";
    if (!v) continue;
    lines.push(`- ${f.label} : ${v.includes("\n") ? "\n  " + v.replace(/\n/g, "\n  ") : v}`);
  }
  const source = String(sourceText || "").trim();
  return `### Données sources\n${source || "(aucune)"}\n\n### Consignes du médecin\n${lines.join("\n") || "(aucune)"}`;
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Forme canonique d'un nom de modèle pour comparaison souple :
 * « inclusionAI: Ling 3.0 Flash VL (free) » → « ling 3 0 flash vl ».
 */
export function normalizeModelName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/^[^:]+:\s*/, "")                                   // préfixe éditeur « inclusionAI: »
    .replace(/\s*\((free|batch|beta|preview|extended|thinking)\)\s*$/g, "")
    .replace(/:(free|batch|beta|extended|thinking)$/, "")         // suffixe d'identifiant « :free »
    .replace(/[\s_\-.\/]+/g, " ")
    .trim();
}

/**
 * Résout ce que l'utilisateur a saisi (identifiant exact, identifiant sans
 * respect de la casse, ou nom d'affichage tel que montré sur le site du
 * fournisseur) vers un identifiant de modèle connu. Renvoie null si inconnu.
 * `models` : tableau d'identifiants ou d'objets { id, name }.
 */
export function resolveModelId(input, models) {
  const q = String(input || "").trim();
  if (!q) return null;
  const list = (models || []).map(m => (typeof m === "string" ? { id: m, name: m } : m)).filter(m => m && m.id);
  if (list.some(m => m.id === q)) return q;

  const lower = q.toLowerCase();
  const byId = list.find(m => m.id.toLowerCase() === lower);
  if (byId) return byId.id;

  const nq = normalizeModelName(q);
  if (!nq) return null;
  const hits = list.filter(m =>
    normalizeModelName(m.name) === nq ||
    normalizeModelName(m.id.split("/").pop()) === nq
  );
  if (!hits.length) return null;
  // Variante demandée explicitement (« (free) », « :batch »…) → on la respecte ;
  // sinon, préférer l'identifiant sans suffixe.
  const wanted = q.match(/\((free|batch|beta|extended|thinking)\)\s*$|:(free|batch|beta|extended|thinking)$/i);
  const variant = wanted ? (wanted[1] || wanted[2]).toLowerCase() : null;
  if (variant) {
    const exact = hits.find(m => m.id.toLowerCase().endsWith(`:${variant}`));
    if (exact) return exact.id;
  }
  const plain = hits.find(m => !m.id.includes(":"));
  return (plain || hits[0]).id;
}
