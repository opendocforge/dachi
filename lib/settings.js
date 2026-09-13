// ============================================================================
// lib/settings.js — Réglages : valeurs par défaut (source unique), lecture et
// écriture. Les secrets (clés API) vont dans chrome.storage.local — jamais
// synchronisés via le compte Google — les préférences dans chrome.storage.sync.
// ============================================================================

// L'ID de projet Scaleway n'est pas une clé, mais il identifie le compte : on le garde
// sur le poste (storage.local) et hors export, comme les clés.
export const SECRET_KEYS = ["scalewayApiKey", "scalewayProjectId", "localApiKey", "apiKey", "openrouterApiKey"];

export const DEFAULT_SETTINGS = {
  provider: "scaleway",
  // Scaleway (HDS)
  scalewayApiKey: "",
  scalewayProjectId: "",
  scalewayModel: "gemma-4-26b-a4b-it",
  // Serveur local / réseau privé
  localServerUrl: "http://localhost:11434/v1",
  localModel: "llama3",
  localRequireKey: false,
  localApiKey: "",
  // OpenAI Direct
  apiKey: "",
  model: "gpt-5-mini",
  // OpenRouter (agrégateur multi-modèles)
  openrouterApiKey: "",
  openrouterModel: "mistralai/mistral-small-3.2-24b-instruct",
  // Génération
  temperature: 0.2,
  streamEnabled: true,
  maxTokens: 4000,
  // Raisonnement interne du modèle : "auto" = désactivé quand le modèle le
  // permet (rédaction : inutile et lent), sinon effort minimal.
  reasoningEffort: "auto",
  // Nombre max d'exemples few-shot envoyés par action (4 = tous)
  fewShotLimit: 4,
  doctorContext: "",
  quickActionId: "corriger_reformuler",
  // Confidentialité
  anonymizeEnabled: true,
  rehydrateEnabled: true,
  confirmBeforeSend: false,
  customAcronyms: "",
  // CGU
  cguAccepted: "",
  cguAcceptedAt: ""
};

const NON_SECRET_DEFAULTS = Object.fromEntries(
  Object.entries(DEFAULT_SETTINGS).filter(([k]) => !SECRET_KEYS.includes(k))
);
const SECRET_DEFAULTS = Object.fromEntries(SECRET_KEYS.map(k => [k, ""]));

function splitSecrets(obj) {
  const secrets = {}, prefs = {};
  for (const [k, v] of Object.entries(obj)) {
    (SECRET_KEYS.includes(k) ? secrets : prefs)[k] = v;
  }
  return { secrets, prefs };
}

/**
 * Charge tous les réglages (préférences sync + secrets local + défauts).
 * Migre une fois les secrets encore présents dans sync vers local.
 */
export async function loadSettings() {
  const [prefs, secrets] = await Promise.all([
    chrome.storage.sync.get(NON_SECRET_DEFAULTS),
    chrome.storage.local.get(SECRET_DEFAULTS)
  ]);

  // Migration : secrets historiquement stockés dans sync
  const legacy = await chrome.storage.sync.get(SECRET_KEYS);
  const toMove = {};
  for (const k of SECRET_KEYS) {
    if (typeof legacy[k] === "string" && legacy[k] && !secrets[k]) toMove[k] = legacy[k];
  }
  const legacyKeys = SECRET_KEYS.filter(k => k in legacy);
  if (Object.keys(toMove).length) {
    await chrome.storage.local.set(toMove);
    Object.assign(secrets, toMove);
  }
  if (legacyKeys.length) {
    await chrome.storage.sync.remove(legacyKeys).catch(() => {});
  }

  return { ...DEFAULT_SETTINGS, ...prefs, ...secrets };
}

/** Enregistre un sous-ensemble de réglages, en routant les secrets vers local. */
export async function saveSettings(partial) {
  const { secrets, prefs } = splitSecrets(partial);
  if (Object.keys(prefs).length) await chrome.storage.sync.set(prefs);
  if (Object.keys(secrets).length) await chrome.storage.local.set(secrets);
}

/** Réglages exportables (jamais de secret). */
export function exportableSettings(settings) {
  const { prefs } = splitSecrets(settings);
  delete prefs.cguAccepted;
  delete prefs.cguAcceptedAt;
  return prefs;
}
