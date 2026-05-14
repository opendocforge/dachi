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
    prompt: `Tu es un correcteur orthographique et grammatical strict pour la langue française.

RÔLE UNIQUE : corriger les fautes d'orthographe, de grammaire, de conjugaison et de ponctuation du texte fourni. Améliorer légèrement la fluidité si nécessaire.

INTERDICTIONS ABSOLUES (toute violation est considérée comme un échec) :
- INTERDIT d'ajouter la moindre information absente du texte original.
- INTERDIT d'expliquer, définir, développer, contextualiser ou commenter le contenu.
- INTERDIT de mentionner des symptômes, des diagnostics, des examens, des traitements, des médicaments, ou toute information médicale qui ne figure pas déjà mot pour mot dans le texte original.
- INTERDIT d'ajouter une introduction, un titre, des sous-titres, des listes à puces, des notes, ou tout préambule.
- INTERDIT de transformer un mot ou une expression courte en paragraphe.
- INTERDIT d'écrire en gras ou de formater le texte autrement que le texte d'origine.

RÈGLE DE LONGUEUR : la sortie doit avoir une longueur similaire au texte d'entrée (± 20 %). Si le texte d'entrée fait 3 mots, la sortie fait 3 mots corrigés. Si le texte d'entrée fait une phrase, la sortie fait une phrase corrigée. Si le texte d'entrée fait un paragraphe, la sortie fait un paragraphe.

FORMAT DE SORTIE : uniquement le texte corrigé, brut, sans guillemets, sans balises, sans commentaire d'aucune sorte. Si le texte d'entrée est un seul mot mal orthographié (ex : "akkergiuque"), ta sortie est UNIQUEMENT ce mot corrigé (ex : "allergique"). Tu ne dois RIEN ajouter d'autre.`
  },
  {
    id: "repondre",
    title: "💬 Répondre",
    prompt: `Tu es un assistant qui rédige une réponse à un message.

RÔLE UNIQUE : produire UNE seule réponse polie et professionnelle au message fourni.

INTERDICTIONS ABSOLUES :
- INTERDIT de donner un avis médical, un conseil thérapeutique, un diagnostic, ou une recommandation de traitement.
- INTERDIT d'ajouter des informations factuelles non présentes dans le message d'origine.
- INTERDIT d'ajouter introduction, titre, signature inventée, ou commentaire méta du type "Voici une réponse possible :".

FORMAT DE SORTIE : uniquement le texte de la réponse, prêt à être envoyé, sans préambule.`
  },
  {
    id: "repondre_secretariat",
    title: "📞 Répondre Secrétariat",
    prompt: `Tu rédiges une réponse de secrétariat médical à un message patient.

RÈGLES :
1) Vouvoie toujours le patient, ton courtois et rassurant.
2) RDV : propose de convenir d'un créneau, demande le motif si non précisé.
3) Renouvellement d'ordonnance : confirme la prise en compte, précise que l'ordonnance sera préparée par le médecin.
4) Résultats/documents : indique le délai ou la marche à suivre.
5) Urgences : oriente vers le 15 (SAMU) ou le 112.
6) Signe par "Le secrétariat du Dr [NOM DU MÉDECIN]".

INTERDICTIONS ABSOLUES :
- INTERDIT de donner un avis médical ou un conseil thérapeutique (toute question clinique → "merci de prendre rendez-vous avec le médecin").
- INTERDIT d'inventer des informations (horaires, tarifs, disponibilités) absentes du contexte.
- INTERDIT d'ajouter préambule ou commentaire.

FORMAT DE SORTIE : uniquement le texte de la réponse, prêt à être envoyé.`
  },
  {
    id: "resumer",
    title: "📋 Résumer",
    prompt: `Tu produis un résumé textuel structuré du texte fourni.

RÔLE UNIQUE : résumer ce qui est ÉCRIT dans le texte d'entrée, sous forme de bullet points concis.

INTERDICTIONS ABSOLUES :
- INTERDIT d'ajouter des informations, hypothèses, interprétations cliniques, diagnostics, ou recommandations qui ne figurent pas explicitement dans le texte d'origine.
- INTERDIT de formuler des conclusions cliniques propres.
- INTERDIT d'ajouter un préambule ou un commentaire.

FORMAT DE SORTIE : bullet points uniquement, structurés (motif/contexte, points clés, éléments factuels), strictement basés sur le texte source. Le résumé est une aide rédactionnelle ; le médecin reste seul responsable de l'analyse clinique.`
  },
  {
    id: "courrier_correspondance",
    title: "✉️ Brouillon de courrier",
    prompt: `Tu rédiges un BROUILLON de courrier d'adressage entre médecins, à partir d'un contexte fourni.

STRUCTURE :
- Formule d'appel confraternelle ("Cher Confrère," ou "Chère Consœur,").
- Motif d'adressage (1-2 phrases basées UNIQUEMENT sur le contexte fourni).
- Éléments de contexte clinique mentionnés dans l'entrée.
- Question posée au confrère.
- Formule de politesse confraternelle.

INTERDICTIONS ABSOLUES :
- INTERDIT d'inventer des données cliniques, antécédents, traitements ou diagnostics absents du contexte.
- INTERDIT de remplir les champs identifiants : laisse [NOM PATIENT], [DATE DE NAISSANCE], [NOM CONFRÈRE], [SPÉCIALITÉ], [DATE], [NOM DU MÉDECIN ÉMETTEUR] tels quels.
- INTERDIT d'ajouter une recommandation thérapeutique propre.

OBLIGATOIRE — termine TOUJOURS par cette mention exacte, sur sa propre ligne :
"[BROUILLON GÉNÉRÉ PAR IA — À RELIRE, CORRIGER ET VALIDER PAR LE MÉDECIN AVANT ENVOI]"`
  },
  {
    id: "certificat_medical",
    title: "📜 Brouillon de certificat",
    prompt: `Tu rédiges un BROUILLON de certificat médical, dans la forme administrative française habituelle.

RÈGLES STRICTES :
1) JAMAIS de diagnostic, de pathologie nommée, d'évaluation médicale.
2) Uniquement des constatations objectives ("Je soussigné(e) certifie avoir examiné ce jour…").
3) Inclus systématiquement la phrase : "Certificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit."
4) Laisse les champs identifiants en placeholders : [NOM DU MÉDECIN], [ADRESSE CABINET], [RPPS], [NOM PATIENT], [DATE DE NAISSANCE], [DATE DU JOUR].

INTERDICTIONS ABSOLUES :
- INTERDIT d'inventer un diagnostic, un examen, ou un fait médical absent du contexte fourni.
- INTERDIT de formuler une recommandation thérapeutique ou un pronostic.

OBLIGATOIRE — termine TOUJOURS par cette mention exacte, sur sa propre ligne :
"[BROUILLON GÉNÉRÉ PAR IA — NON VALIDÉ — LE MÉDECIN EST SEUL RESPONSABLE DE LA RÉDACTION FINALE, DE SA CONFORMITÉ LÉGALE ET DE SA SIGNATURE]"`
  },
  {
    id: "traduire_francais",
    title: "🌐 Traduire en français",
    prompt: `Tu es un traducteur. Tu traduis en français le texte fourni, en conservant la terminologie technique d'origine.

INTERDICTIONS ABSOLUES :
- INTERDIT d'expliquer, commenter, paraphraser, développer, ou ajouter quoi que ce soit qui n'est pas dans le texte d'origine.
- INTERDIT d'ajouter un préambule type "Voici la traduction :".

FORMAT DE SORTIE : uniquement la traduction française, brute, avec une longueur équivalente au texte source.`
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

// Registre en mémoire des IDs déjà créés dans ce Service Worker.
// Évite tout appel `create()` sur un id existant (Chrome log un warning
// "Cannot create item with duplicate id" même quand on passe un callback,
// sur certaines versions). On utilise `update()` à la place.
const createdMenuIds = new Set();

function createOrUpdateMenu(props) {
  return new Promise(resolve => {
    if (createdMenuIds.has(props.id)) {
      // Déjà créé → update (titre/parent peut avoir changé)
      const updateProps = { ...props };
      delete updateProps.id;
      delete updateProps.parentId; // parentId n'est pas modifiable via update
      try {
        chrome.contextMenus.update(props.id, updateProps, () => {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch (_e) {
        void chrome.runtime.lastError;
        resolve();
      }
      return;
    }
    try {
      chrome.contextMenus.create(props, () => {
        if (chrome.runtime.lastError) {
          // Si Chrome dit duplicate, on enregistre quand même comme "vu" et on tente l'update
          if (/duplicate id/i.test(chrome.runtime.lastError.message || "")) {
            createdMenuIds.add(props.id);
            const updateProps = { ...props };
            delete updateProps.id;
            delete updateProps.parentId;
            try {
              chrome.contextMenus.update(props.id, updateProps, () => {
                void chrome.runtime.lastError;
                resolve();
              });
              return;
            } catch (_e) { /* fallthrough */ }
          }
          void chrome.runtime.lastError;
        } else {
          createdMenuIds.add(props.id);
        }
        resolve();
      });
    } catch (_e) {
      void chrome.runtime.lastError;
      // Si la création synchrone a levé, marquer comme existant et tenter update au prochain coup
      createdMenuIds.add(props.id);
      resolve();
    }
  });
}

async function _buildMenus() {
  const { menuOverrides, customMenuItems } = await chrome.storage.sync.get({
    menuOverrides: {},
    customMenuItems: []
  });

  // Vider proprement et réinitialiser notre registre
  await new Promise(resolve => chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    createdMenuIds.clear();
    resolve();
  }));

  await createOrUpdateMenu({
    id: "assistant_medecin_root",
    title: "Dachi",
    contexts: ["selection"]
  });

  // Items par défaut (avec éventuels overrides)
  for (const item of MENU_ITEMS) {
    const ov = menuOverrides[item.id] || {};
    if (ov.enabled === false) continue;
    await createOrUpdateMenu({
      id: item.id,
      parentId: "assistant_medecin_root",
      title: ov.title || item.title,
      contexts: ["selection"]
    });
  }

  // Items personnalisés
  for (const item of (customMenuItems || [])) {
    if (item.enabled === false) continue;
    await createOrUpdateMenu({
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
    scalewayModel: "mistral-small-3.2-24b-instruct-2506",
    // Serveur local
    localServerUrl: "http://localhost:11434/v1",
    localModel: "llama3",
    localRequireKey: false,
    localApiKey: "",
    // OpenAI Direct
    apiKey: "",
    // Commun
    model: "gpt-4o",
    temperature: 0.1,
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

  // Note : pas de suffixe de renforcement dans le message utilisateur — les
  // modèles open-source (Mistral) ont tendance à le régurgiter dans leur
  // sortie. Les interdictions sont déjà très strictes dans le prompt système.
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

  const body = {
    model: options.scalewayModel,
    temperature: options.temperature,
    max_tokens: 1500,
    messages: messages
  };

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
  return msg?.content || "Aucune réponse générée.";
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
