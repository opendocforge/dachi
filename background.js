// ============================================================================
// background.js — Service Worker (Manifest V3)
// Gère le menu contextuel, les appels API (Azure HDS / Scaleway HDS / Local / OpenAI Direct)
// et la communication avec le content script.
// La clé API ne quitte jamais le Service Worker.
// ============================================================================

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
    prompt: `Tu es un assistant médical pour un médecin généraliste français. Résume le texte médical suivant de manière structurée en bullet points. Extrais : le motif/contexte, les éléments clés (diagnostics, résultats, traitements), les conclusions et la conduite à tenir. Sois concis mais ne perds aucune information cliniquement pertinente.`
  },
  {
    id: "interactions_medicamenteuses",
    title: "⚠️ Interactions médicamenteuses",
    prompt: `Tu es un pharmacologue clinicien expert. Analyse la liste de médicaments suivante et identifie toutes les interactions médicamenteuses potentielles. Classe-les par niveau de gravité (Contre-indication absolue / Association déconseillée / Précaution d'emploi / À prendre en compte). Pour chaque interaction, précise : les médicaments concernés, le mécanisme, le risque clinique et la conduite à tenir. Termine OBLIGATOIREMENT par : 'Cette analyse est une aide à la décision et ne remplace pas la consultation des bases officielles (Thériaque, Vidal, ANSM). Vérifiez systématiquement.'`
  },
  {
    id: "courrier_correspondance",
    title: "✉️ Courrier de correspondance",
    prompt: `Tu es un assistant de rédaction médicale pour un médecin généraliste français. À partir du contexte clinique suivant, rédige un brouillon de courrier d'adressage à un médecin spécialiste. Structure : formule d'appel confraternelle, motif d'adressage, antécédents pertinents, histoire de la maladie, examen clinique et résultats, traitement en cours, question posée ou avis demandé, formule de politesse confraternelle. Ton médical professionnel. Laisse des [PLACEHOLDERS] pour les informations manquantes (nom du patient, dates, etc.).`
  },
  {
    id: "certificat_medical",
    title: "📜 Certificat médical",
    prompt: `Tu es un assistant de rédaction médicale expert en droit médical français. Rédige un brouillon de certificat médical à partir du contexte suivant. Règles strictes : 1) Ne jamais mentionner de diagnostic sauf demande explicite (ALD, etc.), 2) Utiliser uniquement des constatations objectives ('Je soussigné certifie avoir examiné ce jour...'), 3) Inclure 'Certificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit', 4) Prévoir les champs [NOM DU MÉDECIN], [ADRESSE CABINET], [RPPS], [NOM PATIENT], [DATE DE NAISSANCE], [DATE DU JOUR]. Ne rédige JAMAIS de certificat de complaisance.`
  },
  {
    id: "interpreter_examens",
    title: "🔬 Interpréter examens",
    prompt: `Tu es un médecin spécialiste en interprétation d'examens complémentaires, assistant un médecin généraliste français. Analyse les résultats suivants quel que soit leur type. Procède ainsi : 1) Identifie le type d'examen, 2) Pour la biologie : indique si chaque paramètre est normal, bas ou élevé et regroupe les anomalies par système, 3) Pour l'imagerie et examens fonctionnels : résume les éléments normaux et pathologiques, mets en évidence les anomalies significatives, 4) Pour la microbiologie : identifie les germes, leur sensibilité et propose les options thérapeutiques de première intention, 5) Propose les hypothèses diagnostiques les plus probables et les examens complémentaires à envisager. Termine OBLIGATOIREMENT par : 'Interprétation à confronter avec le contexte clinique. Ne constitue pas un diagnostic.'`
  },
  {
    id: "traduire_francais",
    title: "🌐 Traduire en français",
    prompt: `Tu es un traducteur médical expert. Traduis le texte suivant en français. Conserve les termes médicaux techniques en français médical standard (pas de vulgarisation). Renvoie uniquement la traduction.`
  }
];

// Map pour accéder rapidement à un item par son id
const MENU_MAP = new Map(MENU_ITEMS.map(item => [item.id, item]));

// ---------------------------------------------------------------------------
// 2. Création du menu contextuel au démarrage
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  // Menu racine
  chrome.contextMenus.create({
    id: "assistant_medecin_root",
    title: "🩺 Assistant Médecin",
    contexts: ["selection"]
  });

  // Sous-menus
  for (const item of MENU_ITEMS) {
    chrome.contextMenus.create({
      id: item.id,
      parentId: "assistant_medecin_root",
      title: item.title,
      contexts: ["selection"]
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Gestion du clic sur un item du menu
// ---------------------------------------------------------------------------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuItem = MENU_MAP.get(info.menuItemId);
  if (!menuItem || !info.selectionText) return;

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

    // Appeler l'API via la fonction abstraite
    const result = await callAI(menuItem.prompt, info.selectionText);

    // Envoyer la réponse au content script
    chrome.tabs.sendMessage(tab.id, {
      action: menuItem.id,
      title: menuItem.title,
      text: info.selectionText,
      phase: "result",
      result: result
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
    return true; // async response
  }
});

// ---------------------------------------------------------------------------
// 6. Fonction abstraite callAI — supporte les 3 fournisseurs
// ---------------------------------------------------------------------------
async function callAI(systemPrompt, userText) {
  const options = await chrome.storage.sync.get({
    provider: "scaleway",
    // Scaleway HDS
    scalewayApiKey: "",
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
    doctorContext: ""
  });

  // Injecter le contexte médecin s'il existe
  let fullSystemPrompt = systemPrompt;
  if (options.doctorContext && options.doctorContext.trim()) {
    fullSystemPrompt = `Contexte du médecin : ${options.doctorContext.trim()}\n\n${systemPrompt}`;
  }

  const messages = [
    { role: "system", content: fullSystemPrompt },
    { role: "user", content: userText }
  ];

  switch (options.provider) {
    case "scaleway":
      return await callScaleway(options, messages);
    case "local":
      return await callLocal(options, messages);
    case "openai":
      return await callOpenAIDirect(options, messages);
    default:
      throw new Error("NO_PROVIDER");
  }
}

// ---------------------------------------------------------------------------
// 7. Scaleway Generative APIs (HDS — France)
// ---------------------------------------------------------------------------
async function callScaleway(options, messages) {
  if (!options.scalewayApiKey) throw new Error("NO_API_KEY_SCALEWAY");
  if (!options.scalewayModel) throw new Error("NO_MODEL_SCALEWAY");

  const body = {
    model: options.scalewayModel,
    temperature: options.temperature,
    max_tokens: 2000,
    messages: messages
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("https://api.scaleway.ai/v1/chat/completions", {
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
    if (status === 401) throw new Error("API_KEY_INVALID");
    if (status === 429) throw new Error("RATE_LIMITED");
    if (status >= 500) throw new Error("SERVER_ERROR");
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`API_ERROR: ${errorData.error?.message || `Erreur HTTP ${status}`}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Aucune réponse générée.";
}

function handleFetchError(error) {
  if (error.name === "AbortError") return new Error("TIMEOUT");
  if (error.message.startsWith("API_") || error.message.startsWith("NO_") ||
      error.message === "RATE_LIMITED" || error.message === "SERVER_ERROR" ||
      error.message === "TIMEOUT" || error.message === "INVALID_AZURE_ENDPOINT" ||
      error.message === "LOCAL_CONNECTION_REFUSED" || error.message === "NO_API_KEY_SCALEWAY" ||
      error.message === "NO_MODEL_SCALEWAY") {
    return error;
  }
  return new Error("NETWORK_ERROR");
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
