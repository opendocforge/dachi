// ============================================================================
// background.js — Service Worker (Manifest V3)
// Gère le menu contextuel, les appels API (Scaleway HDS / Local / OpenAI Direct)
// et la communication avec le content script.
// La clé API ne quitte jamais le Service Worker.
// Anonymisation automatique des données identifiantes avant envoi.
// ============================================================================

// Charger le module d'anonymisation
importScripts("anonymizer.js");

// ---------------------------------------------------------------------------
// 1. Définition des actions du menu contextuel
// ---------------------------------------------------------------------------
const MENU_ITEMS = [
  {
    id: "corriger_reformuler",
    title: "✏️ Corriger & Reformuler",
    prompt: `Tu es un rédacteur et correcteur expert en français médical. Effectue deux tâches sur le texte suivant : 1) Corrige toutes les fautes d'orthographe et de grammaire, 2) Reformule le texte pour le rendre plus clair, fluide et professionnel. Conserve rigoureusement le sens médical et la terminologie technique. Renvoie uniquement le texte final corrigé et reformulé, sans commentaire.`
  },
  {
    id: "repondre",
    title: "💬 Répondre",
    prompt: `Tu es un assistant de communication pour un médecin généraliste français. Génère une réponse professionnelle, empathique et adaptée au texte suivant. Le ton doit être courtois et médical. Renvoie uniquement la réponse.`
  },
  {
    id: "repondre_secretariat",
    title: "📞 Répondre Secrétariat",
    prompt: `Tu es la secrétaire médicale d'un cabinet de médecine générale en France. Génère une réponse professionnelle, chaleureuse et efficace au message patient suivant. Règles : 1) Vouvoie toujours le patient, ton courtois et rassurant, 2) Pour les demandes de RDV : propose de convenir d'un créneau et demande le motif si non précisé, 3) Pour les renouvellements d'ordonnance : confirme la prise en compte et précise que l'ordonnance sera préparée par le médecin, 4) Pour les demandes de résultats ou documents : indique le délai estimé ou la marche à suivre, 5) Pour les urgences : oriente vers le 15 (SAMU) ou le 112, 6) Ne donne JAMAIS d'avis médical ni de conseil thérapeutique — redirige vers une consultation, 7) Signe avec 'Le secrétariat du Dr [NOM DU MÉDECIN]'. Renvoie uniquement la réponse prête à envoyer.`
  },
  {
    id: "resumer",
    title: "📋 Résumer",
    prompt: `Tu assistes un médecin dans la synthèse rédactionnelle d'un texte. Résume le texte suivant de manière structurée en bullet points. Extrais : le motif/contexte, les éléments clés, les conclusions et les éléments à retenir. Sois concis. Le résumé est une aide rédactionnelle uniquement, le médecin reste seul responsable de l'analyse clinique.`
  },
  {
    id: "courrier_correspondance",
    title: "✉️ Brouillon de courrier",
    prompt: `Tu es un assistant de rédaction administrative pour un médecin généraliste français. À partir du contexte suivant, rédige un BROUILLON de courrier d'adressage à un confrère. Structure : formule d'appel confraternelle, motif d'adressage, éléments de contexte, question posée, formule de politesse. Laisse des [PLACEHOLDERS] pour toutes les informations à vérifier. Termine OBLIGATOIREMENT par : '[BROUILLON GÉNÉRÉ PAR IA — À RELIRE, CORRIGER ET VALIDER PAR LE MÉDECIN AVANT ENVOI]'.`
  },
  {
    id: "certificat_medical",
    title: "📜 Brouillon de certificat",
    prompt: `Tu es un assistant de rédaction administrative. Produis un BROUILLON de certificat médical à partir du contexte fourni, en respectant la forme habituelle. Règles strictes : 1) Ne mentionne JAMAIS de diagnostic, 2) N'utilise que des constatations objectives ('Je soussigné certifie avoir examiné ce jour...'), 3) Inclus 'Certificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit', 4) Prévois les champs [NOM DU MÉDECIN], [ADRESSE CABINET], [RPPS], [NOM PATIENT], [DATE DE NAISSANCE], [DATE DU JOUR]. Termine OBLIGATOIREMENT par : '[BROUILLON GÉNÉRÉ PAR IA — NON VALIDÉ — LE MÉDECIN EST SEUL RESPONSABLE DE LA RÉDACTION FINALE, DE SA CONFORMITÉ LÉGALE ET DE SA SIGNATURE]'.`
  },
  {
    id: "traduire_francais",
    title: "🌐 Traduire en français",
    prompt: `Tu es un traducteur professionnel. Traduis le texte suivant en français en conservant la terminologie technique. Renvoie uniquement la traduction.`
  }
];

// Map pour accéder rapidement à un item par son id
const MENU_MAP = new Map(MENU_ITEMS.map(item => [item.id, item]));

// ---------------------------------------------------------------------------
// 2. Construction dynamique du menu contextuel
// ---------------------------------------------------------------------------

/**
 * Reconstruit le menu contextuel depuis storage + defaults.
 * Verrou isBuilding pour éviter les appels concurrents (duplicate id).
 */
let buildMenusPromise = null;
function buildMenus() {
  // Chaîner les appels pour éviter tout doublon (pas de concurrence)
  buildMenusPromise = (buildMenusPromise || Promise.resolve()).then(() => _buildMenus());
  return buildMenusPromise;
}

// Helper : create avec callback ET try/catch synchrone (chrome.contextMenus.create
// est synchrone et peut lever une exception en cas de duplicate id).
function safeCreate(props) {
  return new Promise(resolve => {
    try {
      chrome.contextMenus.create(props, () => {
        // Consomme toute erreur asynchrone (duplicate id, parent manquant, etc.)
        void chrome.runtime.lastError;
        resolve();
      });
    } catch (_e) {
      // Exception synchrone (ex: duplicate id) — on l'ignore et on continue
      void chrome.runtime.lastError;
      resolve();
    }
  });
}

async function _buildMenus() {
  const { menuOverrides, customMenuItems } = await chrome.storage.sync.get({
    menuOverrides: {},
    customMenuItems: []
  });

  // 1) removeAll DEUX FOIS pour vider la registry persistée par Chrome au réveil du SW
  await new Promise(resolve => chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    resolve();
  }));
  // 2) Petit yield pour laisser Chrome propager la suppression
  await new Promise(r => setTimeout(r, 50));
  await new Promise(resolve => chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    resolve();
  }));

  await safeCreate({
    id: "assistant_medecin_root",
    title: "Dachi",
    contexts: ["selection"]
  });

  // Items par défaut (avec éventuels overrides)
  for (const item of MENU_ITEMS) {
    const ov = menuOverrides[item.id] || {};
    if (ov.enabled === false) continue;
    await safeCreate({
      id: item.id,
      parentId: "assistant_medecin_root",
      title: ov.title || item.title,
      contexts: ["selection"]
    });
  }

  // Items personnalisés
  for (const item of (customMenuItems || [])) {
    if (item.enabled === false) continue;
    await safeCreate({
      id: item.id,
      parentId: "assistant_medecin_root",
      title: item.title,
      contexts: ["selection"]
    });
  }
}

chrome.runtime.onInstalled.addListener(() => buildMenus());
chrome.runtime.onStartup.addListener(() => buildMenus());

// Reconstruire le menu si les items changent dans storage
chrome.storage.onChanged.addListener((changes) => {
  if ("menuOverrides" in changes || "customMenuItems" in changes) {
    buildMenus();
  }
});

// ---------------------------------------------------------------------------
// 3. Gestion du clic sur un item du menu
// ---------------------------------------------------------------------------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText || info.menuItemId === "assistant_medecin_root") return;

  // Résoudre le prompt depuis storage + defaults
  const { menuOverrides, customMenuItems } = await chrome.storage.sync.get({
    menuOverrides: {},
    customMenuItems: []
  });

  const menuId = info.menuItemId;
  let menuItem = null;

  const defaultItem = MENU_ITEMS.find(m => m.id === menuId);
  if (defaultItem) {
    const ov = menuOverrides[menuId] || {};
    menuItem = {
      id: defaultItem.id,
      title: ov.title || defaultItem.title,
      prompt: ov.prompt || defaultItem.prompt
    };
  } else {
    menuItem = (customMenuItems || []).find(m => m.id === menuId);
  }

  if (!menuItem) return;

  try {
    // Injecter le CSS puis le JS dans l'onglet actif
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    // Petite pause pour laisser le content script s'initialiser
    await new Promise(r => setTimeout(r, 100));

    // Envoyer le message au content script pour afficher le loader
    chrome.tabs.sendMessage(tab.id, {
      action: menuItem.id,
      title: menuItem.title,
      text: info.selectionText,
      phase: "loading"
    });

    // Appeler l'API via la fonction abstraite (retourne le résultat + infos anonymisation)
    const { result, anonymization } = await callAI(menuItem.prompt, info.selectionText);

    // Envoyer la réponse au content script
    chrome.tabs.sendMessage(tab.id, {
      action: menuItem.id,
      title: menuItem.title,
      text: info.selectionText,
      phase: "result",
      result: result,
      anonymization: anonymization
    });

  } catch (error) {
    // Envoyer l'erreur au content script
    chrome.tabs.sendMessage(tab.id, {
      action: menuItem.id,
      title: menuItem.title,
      phase: "error",
      error: error.message
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Clic sur l'icône de l'extension → ouvre les options
// ---------------------------------------------------------------------------
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// ---------------------------------------------------------------------------
// 5. Écouter les messages du content script
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openOptions") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
  if (message.action === "testConnection") {
    testLocalConnection(message.config)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.action === "testScaleway") {
    testScalewayConnection(message.config)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.action === "rebuildMenus") {
    buildMenus().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ---------------------------------------------------------------------------
// 6. Fonction abstraite callAI — supporte les 3 fournisseurs
// ---------------------------------------------------------------------------
async function callAI(systemPrompt, userText) {
  // Vérifier l'acceptation des CGU avant tout appel API
  const cgu = await chrome.storage.sync.get({ cguAccepted: "" });
  if (cgu.cguAccepted !== "1.0") {
    chrome.runtime.openOptionsPage();
    throw new Error("CGU_NOT_ACCEPTED");
  }

  const options = await chrome.storage.sync.get({
    provider: "scaleway",
    // Scaleway HDS
    scalewayApiKey: "",
    scalewayProjectId: "",
    scalewayModel: "qwen3.5-397b-a17b",
    // Serveur local
    localServerUrl: "http://localhost:11434/v1",
    localModel: "llama3",
    localRequireKey: false,
    localApiKey: "",
    // OpenAI Direct
    apiKey: "",
    // Commun
    model: "gpt-4o",
    temperature: 0.3,
    doctorContext: "",
    // Anonymisation
    anonymizeEnabled: true
  });

  // Anonymisation automatique du texte utilisateur avant envoi à l'API
  let anonymization = { enabled: false, count: 0, replacements: {} };
  let processedText = userText;
  if (options.anonymizeEnabled) {
    const result = anonymizeText(userText);
    processedText = result.text;
    anonymization = {
      enabled: true,
      count: result.count,
      replacements: result.replacements
    };
  }

  // Injecter le contexte médecin s'il existe
  let fullSystemPrompt = systemPrompt;
  if (options.doctorContext && options.doctorContext.trim()) {
    fullSystemPrompt = `Contexte du médecin : ${options.doctorContext.trim()}\n\n${systemPrompt}`;
  }

  const messages = [
    { role: "system", content: fullSystemPrompt },
    { role: "user", content: processedText }
  ];

  let result;
  switch (options.provider) {
    case "scaleway":
      result = await callScaleway(options, messages);
      break;
    case "local":
      result = await callLocal(options, messages);
      break;
    case "openai":
      result = await callOpenAIDirect(options, messages);
      break;
    default:
      throw new Error("NO_PROVIDER");
  }

  return { result, anonymization };
}

// ---------------------------------------------------------------------------
// 7. Scaleway Generative APIs (HDS — France)
// ---------------------------------------------------------------------------
async function callScaleway(options, messages) {
  if (!options.scalewayApiKey) throw new Error("NO_API_KEY_SCALEWAY");
  if (!options.scalewayProjectId) throw new Error("NO_PROJECT_ID_SCALEWAY");
  if (!options.scalewayModel) throw new Error("NO_MODEL_SCALEWAY");

  // qwen (raisonnement) a besoin de plus de tokens pour penser + répondre
  const isReasoning = /^qwen/i.test(options.scalewayModel);
  const body = {
    model: options.scalewayModel,
    temperature: options.temperature,
    max_tokens: isReasoning ? 4000 : 1500,
    messages: messages,
    stream: false
  };

  if (isReasoning) {
    body.reasoning_effort = "low";
    body.response_format = { type: "text" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  const endpoint = `https://api.scaleway.ai/${options.scalewayProjectId}/v1/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${options.scalewayApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return await handleResponse(response);
  } catch (error) {
    clearTimeout(timeoutId);
    throw handleFetchError(error);
  }
}

// ---------------------------------------------------------------------------
// 10. Serveur local (Ollama / LM Studio / etc.)
// ---------------------------------------------------------------------------
async function callLocal(options, messages) {
  if (!options.localServerUrl) throw new Error("NO_LOCAL_URL");
  if (!options.localModel) throw new Error("NO_LOCAL_MODEL");

  const baseUrl = options.localServerUrl.replace(/\/+$/, "");
  const apiUrl = `${baseUrl}/chat/completions`;

  const headers = { "Content-Type": "application/json" };
  if (options.localRequireKey && options.localApiKey) {
    headers["Authorization"] = `Bearer ${options.localApiKey}`;
  }

  const body = {
    model: options.localModel,
    temperature: options.temperature,
    max_tokens: 2000,
    messages: messages
  };

  // Timeout 60s pour les modèles locaux (plus lents)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return await handleResponse(response);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "TypeError" && error.message.includes("Failed to fetch")) {
      throw new Error("LOCAL_CONNECTION_REFUSED");
    }
    throw handleFetchError(error);
  }
}

// ---------------------------------------------------------------------------
// 11. OpenAI Direct
// ---------------------------------------------------------------------------
async function callOpenAIDirect(options, messages) {
  if (!options.apiKey) throw new Error("NO_API_KEY");

  const body = {
    model: options.model,
    temperature: options.temperature,
    max_tokens: 2000,
    messages: messages
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return await handleResponse(response);
  } catch (error) {
    clearTimeout(timeoutId);
    throw handleFetchError(error);
  }
}

// ---------------------------------------------------------------------------
// 12. Helpers — gestion réponse et erreurs
// ---------------------------------------------------------------------------
async function handleResponse(response) {
  if (!response.ok) {
    const status = response.status;
    // Tenter d'extraire le vrai message d'erreur du body (utile pour debug Scaleway)
    let bodyMsg = "";
    try {
      const errorData = await response.json();
      bodyMsg = errorData.error?.message || errorData.message || errorData.detail || JSON.stringify(errorData);
    } catch (_) {
      try { bodyMsg = await response.text(); } catch (_) {}
    }
    if (status === 401) throw new Error(`API_KEY_INVALID: HTTP 401 — ${bodyMsg}`);
    if (status === 429) throw new Error("RATE_LIMITED");
    if (status >= 500) throw new Error(`SERVER_ERROR: HTTP ${status} — ${bodyMsg}`);
    throw new Error(`API_ERROR: HTTP ${status} — ${bodyMsg}`);
  }
  const data = await response.json();
  const msg = data.choices?.[0]?.message;
  // Fallback : certains modèles de raisonnement (qwen3.5) renvoient le
  // texte dans reasoning_content quand content est vide.
  return msg?.content || msg?.reasoning_content || "Aucune réponse générée.";
}

function handleFetchError(error) {
  if (error.name === "AbortError") return new Error("TIMEOUT");
  if (error.message.startsWith("API_") || error.message.startsWith("NO_") ||
      error.message === "RATE_LIMITED" || error.message === "SERVER_ERROR" ||
      error.message === "TIMEOUT" || error.message === "INVALID_AZURE_ENDPOINT" ||
      error.message === "LOCAL_CONNECTION_REFUSED" || error.message === "NO_API_KEY_SCALEWAY" ||
      error.message === "NO_PROJECT_ID_SCALEWAY" ||
      error.message === "NO_MODEL_SCALEWAY" || error.message === "CGU_NOT_ACCEPTED") {
    return error;
  }
  return new Error("NETWORK_ERROR");
}

// ---------------------------------------------------------------------------
// 13bis. Test connexion Scaleway (appelé depuis options.js)
// ---------------------------------------------------------------------------
async function testScalewayConnection(config) {
  const apiKey = (config.scalewayApiKey || "").trim();
  const projectId = (config.scalewayProjectId || "").trim();
  const model = (config.scalewayModel || "").trim();

  if (!apiKey) return { ok: false, error: "Clé API Scaleway manquante." };
  if (!projectId) return { ok: false, error: "ID de projet Scaleway manquant." };
  if (!model) return { ok: false, error: "Modèle Scaleway non sélectionné." };

  const endpoint = `https://api.scaleway.ai/${projectId}/v1/chat/completions`;
  const body = {
    model,
    temperature: 0.1,
    max_tokens: 2000,
    messages: [
      { role: "system", content: "Réponds simplement 'OK'." },
      { role: "user", content: "ping" }
    ]
  };
  if (/^qwen/i.test(model)) {
    body.reasoning_effort = "low";
    body.response_format = { type: "text" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const m = data.choices?.[0]?.message;
      const finishReason = data.choices?.[0]?.finish_reason;
      const usage = data.usage;
      const reply = m?.content || m?.reasoning;
      if (reply) {
        return { ok: true, info: `Connexion réussie. Modèle "${model}" — réponse : "${String(reply).slice(0, 120)}"` };
      }
      // Pas de contenu : on renvoie un dump pour debug
      return {
        ok: false,
        error: `Connexion OK mais réponse vide. finish_reason=${finishReason}, usage=${JSON.stringify(usage)}, message=${JSON.stringify(m)}, raw=${JSON.stringify(data).slice(0, 800)}`
      };
    }

    // Récupérer le vrai message d'erreur
    let bodyMsg = "";
    try {
      const errorData = await response.json();
      bodyMsg = errorData.error?.message || errorData.message || errorData.detail || JSON.stringify(errorData);
    } catch (_) {
      try { bodyMsg = await response.text(); } catch (_) {}
    }
    return {
      ok: false,
      error: `HTTP ${response.status} — ${bodyMsg || "erreur inconnue"}`,
      endpoint
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      return { ok: false, error: "Délai dépassé (15 s)." };
    }
    return { ok: false, error: `Réseau : ${error.message}` };
  }
}

// ---------------------------------------------------------------------------
// 13. Test connexion serveur local (appelé depuis options.js)
// ---------------------------------------------------------------------------
async function testLocalConnection(config) {
  const baseUrl = (config.localServerUrl || "http://localhost:11434/v1").replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json" };
  if (config.localRequireKey && config.localApiKey) {
    headers["Authorization"] = `Bearer ${config.localApiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      return { ok: true };
    }
    return { ok: false, error: `Erreur HTTP ${response.status}` };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      return { ok: false, error: "Délai dépassé (10s)" };
    }
    return { ok: false, error: "Le serveur local ne répond pas. Vérifiez qu'Ollama/LM Studio est bien lancé." };
  }
}
