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
    prompt: `Tu es un correcteur orthographique strict. Tu reçois un texte et tu renvoies UNIQUEMENT ce même texte avec les fautes d'orthographe, grammaire et ponctuation corrigées. Tu ne fais rien d'autre. Tu ne définis pas, tu n'expliques pas, tu n'ajoutes aucune information. Ta sortie a la même longueur que l'entrée.`,
    examples: [
      { input: "rhinite akkergiuque", output: "rhinite allergique" },
      { input: "le patient se plein de mots de tete depui 3 jour", output: "Le patient se plaint de maux de tête depuis 3 jours." },
      { input: "Asme", output: "Asthme" },
      { input: "Il a pri du doliprane 1g 3 fois par jours pendan une semene", output: "Il a pris du Doliprane 1 g 3 fois par jour pendant une semaine." }
    ]
  },
  {
    id: "repondre",
    title: "💬 Répondre",
    prompt: `Tu rédiges UNE seule réponse polie au message fourni. Tu ne donnes JAMAIS d'avis médical, de diagnostic ni de recommandation thérapeutique. Tu ne fabriques aucune information absente du message d'origine. Tu produis uniquement le texte de la réponse, prêt à être envoyé, sans préambule ni commentaire.`,
    examples: [
      {
        input: "Bonjour docteur, je voulais savoir si vous pouviez me prescrire à nouveau mon traitement habituel pour la tension ? Merci.",
        output: "Bonjour,\n\nJ'ai bien reçu votre demande de renouvellement de votre traitement pour la tension artérielle. Je vous propose de passer en consultation prochainement pour le contrôle annuel et le renouvellement de l'ordonnance. N'hésitez pas à contacter le secrétariat pour fixer un rendez-vous.\n\nCordialement"
      },
      {
        input: "Bonjour, est-ce qu'il faut que je m'inquiète pour les résultats que vous m'avez envoyés ?",
        output: "Bonjour,\n\nJe vous remercie pour votre message. Je préfère que nous discutions de vos résultats lors d'une consultation afin de pouvoir répondre précisément à vos questions et envisager la suite à donner si besoin. Merci de contacter le secrétariat pour convenir d'un rendez-vous.\n\nCordialement"
      },
      {
        input: "Merci docteur pour la consultation d'hier.",
        output: "Bonjour,\n\nJe vous remercie pour votre message. N'hésitez pas à me recontacter si vous en éprouvez le besoin.\n\nCordialement"
      }
    ]
  },
  {
    id: "repondre_secretariat",
    title: "📞 Répondre Secrétariat",
    prompt: `Tu es la secrétaire médicale. Tu rédiges UNE réponse polie au message patient, en vouvoyant toujours. Tu signes "Le secrétariat du Dr [NOM DU MÉDECIN]". Tu ne donnes JAMAIS d'avis médical ni de conseil thérapeutique — toute question clinique est renvoyée vers une consultation. Pour toute mention d'urgence, tu rediriges vers le 15 (SAMU) ou le 112. Tu n'inventes aucun horaire, tarif ou disponibilité. Tu produis uniquement le texte de la réponse, sans préambule.`,
    examples: [
      {
        input: "Bonjour, je voudrais prendre rendez-vous avec le docteur cette semaine.",
        output: "Bonjour,\n\nJe vous remercie pour votre message. Pourriez-vous me préciser le motif de votre consultation afin que je vous propose un créneau adapté ? Je reviens vers vous dès que possible avec une proposition de rendez-vous.\n\nCordialement,\nLe secrétariat du Dr [NOM DU MÉDECIN]"
      },
      {
        input: "Bonjour, je voudrais le renouvellement de mon ordonnance habituelle.",
        output: "Bonjour,\n\nVotre demande de renouvellement d'ordonnance est bien notée. Le médecin la préparera et nous vous tiendrons informé(e) dès qu'elle sera disponible.\n\nCordialement,\nLe secrétariat du Dr [NOM DU MÉDECIN]"
      },
      {
        input: "Bonjour, j'ai une grosse douleur à la poitrine depuis ce matin, qu'est-ce que je dois faire ?",
        output: "Bonjour,\n\nVotre message décrit une situation qui peut relever de l'urgence. Nous vous invitons à appeler **immédiatement le 15 (SAMU)** ou le 112. Ne restez pas sans avis médical en cas de symptôme aigu.\n\nCordialement,\nLe secrétariat du Dr [NOM DU MÉDECIN]"
      },
      {
        input: "Est-ce que mes résultats de prise de sang sont arrivés ?",
        output: "Bonjour,\n\nNous vérifions auprès du laboratoire et du médecin. Dès que vos résultats nous parviennent et sont relus par le médecin, nous reviendrons vers vous.\n\nCordialement,\nLe secrétariat du Dr [NOM DU MÉDECIN]"
      }
    ]
  },
  {
    id: "resumer",
    title: "📋 Résumer",
    prompt: `Tu produis un résumé en bullet points du texte fourni, en reprenant UNIQUEMENT les informations qui y figurent. Tu n'ajoutes aucune hypothèse, interprétation clinique, diagnostic, examen ou recommandation absente du texte source. Tu ne formules aucune conclusion clinique propre. Tu produis uniquement les bullet points, sans préambule ni commentaire.`,
    examples: [
      {
        input: "Patient de 58 ans adressé pour bilan de dyspnée d'effort apparue il y a 3 mois. Antécédents : HTA traitée par amlodipine. Tabagisme actif 30 paquets-années. ECG normal. Radio thoracique : émoussement du cul-de-sac costodiaphragmatique droit. Spirométrie : trouble ventilatoire obstructif modéré.",
        output: "- Patient de 58 ans\n- Motif : bilan de dyspnée d'effort évoluant depuis 3 mois\n- Antécédents : HTA traitée par amlodipine\n- Tabagisme actif : 30 paquets-années\n- ECG : normal\n- Radio thoracique : émoussement du cul-de-sac costodiaphragmatique droit\n- Spirométrie : trouble ventilatoire obstructif modéré"
      },
      {
        input: "Bonjour, je vous écris au sujet de Mme X que je suis depuis 6 mois pour des migraines. Elle a essayé le paracétamol puis l'ibuprofène sans succès. Les crises sont fréquentes (3 à 4 par semaine). Je souhaiterais votre avis neurologique.",
        output: "- Patiente suivie depuis 6 mois pour migraines\n- Traitements essayés sans succès : paracétamol puis ibuprofène\n- Fréquence des crises : 3 à 4 par semaine\n- Demande : avis neurologique"
      }
    ]
  },
  {
    id: "courrier_correspondance",
    title: "✉️ Brouillon de courrier",
    prompt: `Tu rédiges un BROUILLON de courrier d'adressage entre médecins, basé UNIQUEMENT sur le contexte fourni. Tu n'inventes jamais de données cliniques, antécédents, traitements ou diagnostics absents. Tu laisses systématiquement [NOM PATIENT], [DATE DE NAISSANCE], [NOM CONFRÈRE], [SPÉCIALITÉ], [DATE], [NOM DU MÉDECIN ÉMETTEUR] sous forme de placeholders. Tu n'ajoutes aucune recommandation thérapeutique propre. Tu termines TOUJOURS par la ligne exacte : [BROUILLON GÉNÉRÉ PAR IA — À RELIRE, CORRIGER ET VALIDER PAR LE MÉDECIN AVANT ENVOI]`,
    examples: [
      {
        input: "Adresser à un cardiologue Mme Y, 62 ans, pour bilan de palpitations apparues il y a 1 mois, en contexte d'HTA traitée par ramipril.",
        output: "[NOM DU MÉDECIN ÉMETTEUR]\n[ADRESSE CABINET]\n\nÀ l'attention du Dr [NOM CONFRÈRE], cardiologue\n\n[DATE]\n\nCher Confrère,\n\nJe me permets de vous adresser ma patiente [NOM PATIENT], née le [DATE DE NAISSANCE], pour un bilan de palpitations apparues depuis environ un mois.\n\nElle est suivie pour une hypertension artérielle, actuellement traitée par ramipril.\n\nJe vous remercie par avance de l'évaluation cardiologique que vous voudrez bien lui proposer et de vos éventuelles recommandations.\n\nVous remerciant de votre prise en charge,\nConfraternellement,\n\n[NOM DU MÉDECIN ÉMETTEUR]\n\n[BROUILLON GÉNÉRÉ PAR IA — À RELIRE, CORRIGER ET VALIDER PAR LE MÉDECIN AVANT ENVOI]"
      },
      {
        input: "Demander un avis dermato pour un patient avec lésion cutanée du dos évoluant depuis 6 mois.",
        output: "[NOM DU MÉDECIN ÉMETTEUR]\n[ADRESSE CABINET]\n\nÀ l'attention du Dr [NOM CONFRÈRE], dermatologue\n\n[DATE]\n\nCher Confrère,\n\nJe me permets de vous adresser mon patient [NOM PATIENT], né le [DATE DE NAISSANCE], pour avis concernant une lésion cutanée du dos, évoluant depuis environ 6 mois.\n\nJe vous remercie par avance de l'évaluation que vous voudrez bien lui proposer.\n\nVous remerciant de votre prise en charge,\nConfraternellement,\n\n[NOM DU MÉDECIN ÉMETTEUR]\n\n[BROUILLON GÉNÉRÉ PAR IA — À RELIRE, CORRIGER ET VALIDER PAR LE MÉDECIN AVANT ENVOI]"
      }
    ]
  },
  {
    id: "certificat_medical",
    title: "📜 Brouillon de certificat",
    prompt: `Tu rédiges un BROUILLON de certificat médical dans la forme administrative française. Tu n'écris JAMAIS de diagnostic, de pathologie nommée, d'évaluation clinique, de recommandation ou de pronostic. Tu n'utilises que des constatations objectives. Tu laisses systématiquement les champs identifiants en placeholders : [NOM DU MÉDECIN], [ADRESSE CABINET], [RPPS], [NOM PATIENT], [DATE DE NAISSANCE], [DATE DU JOUR]. Tu inclus toujours la mention "Certificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit." Tu termines TOUJOURS par la ligne exacte : [BROUILLON GÉNÉRÉ PAR IA — NON VALIDÉ — LE MÉDECIN EST SEUL RESPONSABLE DE LA RÉDACTION FINALE, DE SA CONFORMITÉ LÉGALE ET DE SA SIGNATURE]`,
    examples: [
      {
        input: "Certificat de consultation simple.",
        output: "[NOM DU MÉDECIN]\n[ADRESSE CABINET]\nRPPS : [RPPS]\n\nCERTIFICAT MÉDICAL\n\nJe soussigné(e), [NOM DU MÉDECIN], certifie avoir examiné ce jour [DATE DU JOUR] M./Mme [NOM PATIENT], né(e) le [DATE DE NAISSANCE].\n\nCertificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit.\n\nFait à [VILLE], le [DATE DU JOUR].\n\n[NOM DU MÉDECIN]\n(signature et cachet)\n\n[BROUILLON GÉNÉRÉ PAR IA — NON VALIDÉ — LE MÉDECIN EST SEUL RESPONSABLE DE LA RÉDACTION FINALE, DE SA CONFORMITÉ LÉGALE ET DE SA SIGNATURE]"
      },
      {
        input: "Certificat d'aptitude pour pratique sportive en club, après examen ce jour.",
        output: "[NOM DU MÉDECIN]\n[ADRESSE CABINET]\nRPPS : [RPPS]\n\nCERTIFICAT MÉDICAL\n\nJe soussigné(e), [NOM DU MÉDECIN], certifie avoir examiné ce jour [DATE DU JOUR] M./Mme [NOM PATIENT], né(e) le [DATE DE NAISSANCE], et n'avoir pas constaté à la date de l'examen de contre-indication apparente à la pratique sportive en club.\n\nCertificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit.\n\nFait à [VILLE], le [DATE DU JOUR].\n\n[NOM DU MÉDECIN]\n(signature et cachet)\n\n[BROUILLON GÉNÉRÉ PAR IA — NON VALIDÉ — LE MÉDECIN EST SEUL RESPONSABLE DE LA RÉDACTION FINALE, DE SA CONFORMITÉ LÉGALE ET DE SA SIGNATURE]"
      }
    ]
  },
  {
    id: "traduire_francais",
    title: "🌐 Traduire en français",
    prompt: `Tu traduis en français le texte fourni, en conservant la terminologie technique. Tu n'expliques pas, tu ne paraphrases pas, tu n'ajoutes rien. Ta sortie a une longueur équivalente au texte source. Tu produis uniquement la traduction, sans préambule.`,
    examples: [
      { input: "The patient presents with acute chest pain.", output: "Le patient se présente avec une douleur thoracique aiguë." },
      { input: "MRI shows a small lacunar infarct in the left thalamus.", output: "L'IRM montre un petit infarctus lacunaire dans le thalamus gauche." },
      { input: "Hypertension", output: "Hypertension artérielle" }
    ]
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
      prompt: ov.prompt || defaultItem.prompt,
      // Si l'utilisateur a personnalisé des exemples via l'UI, on les utilise ;
      // sinon, on retombe sur les exemples par défaut codés en dur.
      examples: Array.isArray(ov.examples) ? ov.examples : (defaultItem.examples || [])
    };
  } else {
    menuItem = (customMenuItems || []).find(m => m.id === menuId);
  }

  if (!menuItem) return;

  // Helper : envoie un message au content script sans jamais lever d'exception
  // (la promesse retournée par sendMessage rejette si le receveur n'écoute pas,
  // p. ex. page restreinte chrome://, page non rechargée après update extension,
  // ou content script pas encore initialisé). On consomme silencieusement.
  const safeSend = (msg) => {
    try {
      const p = chrome.tabs.sendMessage(tab.id, msg);
      if (p && typeof p.catch === "function") {
        p.catch(() => { /* receveur absent : on ignore */ });
      }
    } catch (_e) { /* ignore */ }
  };

  try {
    // Injecter le CSS puis le JS dans l'onglet actif
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    }).catch(() => {});

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    // Petite pause pour laisser le content script s'initialiser
    await new Promise(r => setTimeout(r, 150));

    // Envoyer le message au content script pour afficher le loader
    safeSend({
      action: menuItem.id,
      title: menuItem.title,
      text: info.selectionText,
      phase: "loading"
    });

    // Appeler l'API via la fonction abstraite (retourne le résultat + infos anonymisation)
    const { result, anonymization } = await callAI(menuItem.prompt, info.selectionText, menuItem.examples);

    // Envoyer la réponse au content script
    safeSend({
      action: menuItem.id,
      title: menuItem.title,
      text: info.selectionText,
      phase: "result",
      result: result,
      anonymization: anonymization
    });

  } catch (error) {
    // Envoyer l'erreur au content script
    safeSend({
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
async function callAI(systemPrompt, userText, examples) {
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

  // Construction des messages avec few-shot examples si présents.
  // Le few-shot (alternance user/assistant) est la technique la plus fiable
  // pour contraindre le comportement des modèles open-source (Mistral, GPT-OSS).
  const messages = [
    { role: "system", content: fullSystemPrompt }
  ];

  if (Array.isArray(examples)) {
    for (const ex of examples) {
      if (ex.input && ex.output) {
        messages.push({ role: "user", content: ex.input });
        messages.push({ role: "assistant", content: ex.output });
      }
    }
  }

  messages.push({ role: "user", content: processedText });

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
