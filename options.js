// ============================================================================
// options.js — Logique de la page d'options multi-fournisseurs
// Sauvegarde et restauration via chrome.storage.sync
// ============================================================================

(() => {
  // -------------------------------------------------------------------------
  // CGU — acceptation obligatoire au premier lancement
  // -------------------------------------------------------------------------
  const CGU_VERSION = "1.0";
  const cguOverlay = document.getElementById("cgu-overlay");
  const cguCheckbox = document.getElementById("cgu-accept-checkbox");
  const cguAcceptBtn = document.getElementById("cgu-accept-btn");
  const reviewCguBtn = document.getElementById("review-cgu-btn");
  const revokeCguLink = document.getElementById("revoke-cgu-link");

  chrome.storage.sync.get({ cguAccepted: "", cguAcceptedAt: "" }, (items) => {
    if (items.cguAccepted !== CGU_VERSION) {
      cguOverlay.classList.remove("hidden");
    }
  });

  cguCheckbox.addEventListener("change", () => {
    cguAcceptBtn.disabled = !cguCheckbox.checked;
  });

  cguAcceptBtn.addEventListener("click", () => {
    if (!cguCheckbox.checked) return;
    chrome.storage.sync.set({
      cguAccepted: CGU_VERSION,
      cguAcceptedAt: new Date().toISOString()
    }, () => {
      cguOverlay.classList.add("hidden");
    });
  });

  reviewCguBtn.addEventListener("click", () => {
    cguCheckbox.checked = false;
    cguAcceptBtn.disabled = true;
    cguOverlay.classList.remove("hidden");
  });

  revokeCguLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (confirm("Révoquer l'acceptation des CGU ? Elles devront être acceptées à nouveau.")) {
      chrome.storage.sync.set({ cguAccepted: "", cguAcceptedAt: "" }, () => {
        cguCheckbox.checked = false;
        cguAcceptBtn.disabled = true;
        cguOverlay.classList.remove("hidden");
      });
    }
  });

  // -------------------------------------------------------------------------
  // Références DOM
  // -------------------------------------------------------------------------
  const providerSelect = document.getElementById("provider");

  // Scaleway
  const scalewayApiKeyInput = document.getElementById("scaleway-api-key");
  const scalewayProjectIdInput = document.getElementById("scaleway-project-id");
  const scalewayModelSelect = document.getElementById("scaleway-model");

  // Local
  const localServerUrlInput = document.getElementById("local-server-url");
  const localModelInput = document.getElementById("local-model");
  const localRequireKeyCheckbox = document.getElementById("local-require-key");
  const localApiKeyInput = document.getElementById("local-api-key");
  const localKeyGroup = document.getElementById("local-key-group");
  const testConnectionBtn = document.getElementById("test-connection-btn");
  const testResultSpan = document.getElementById("test-result");

  // OpenAI Direct
  const openaiApiKeyInput = document.getElementById("openai-api-key");

  // Anonymisation
  const anonymizeCheckbox = document.getElementById("anonymize-enabled");

  // Commun
  const modelSelect = document.getElementById("model");
  const modelGroup = document.getElementById("model-group");
  const temperatureSlider = document.getElementById("temperature");
  const tempValueDisplay = document.getElementById("temp-value");
  const doctorContextTextarea = document.getElementById("doctor-context");
  const saveBtn = document.getElementById("save-btn");
  const toast = document.getElementById("toast");

  // Provider field containers
  const fieldsScaleway = document.getElementById("fields-scaleway");
  const fieldsLocal = document.getElementById("fields-local");
  const fieldsOpenai = document.getElementById("fields-openai");

  // -------------------------------------------------------------------------
  // 1. Basculer l'affichage des champs selon le fournisseur
  // -------------------------------------------------------------------------
  function updateProviderFields() {
    const provider = providerSelect.value;

    fieldsScaleway.classList.toggle("active", provider === "scaleway");
    fieldsLocal.classList.toggle("active", provider === "local");
    fieldsOpenai.classList.toggle("active", provider === "openai");

    // Le sélecteur de modèle n'est pertinent que pour OpenAI Direct
    if (provider === "openai") {
      modelGroup.style.display = "";
    } else {
      modelGroup.style.display = "none";
    }
  }

  providerSelect.addEventListener("change", updateProviderFields);

  // -------------------------------------------------------------------------
  // 2. Toggle clé API locale
  // -------------------------------------------------------------------------
  localRequireKeyCheckbox.addEventListener("change", () => {
    localKeyGroup.classList.toggle("hidden", !localRequireKeyCheckbox.checked);
  });

  // -------------------------------------------------------------------------
  // 3. Toggle password visibility (délégation)
  // -------------------------------------------------------------------------
  document.querySelectorAll(".toggle-password").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.textContent = isPassword ? "🔒" : "👁️";
    });
  });

  // -------------------------------------------------------------------------
  // 4. Restaurer les paramètres sauvegardés
  // -------------------------------------------------------------------------
  chrome.storage.sync.get(
    {
      provider: "scaleway",
      scalewayApiKey: "",
      scalewayProjectId: "",
      scalewayModel: "qwen3.5-397b-a17b",
      localServerUrl: "http://localhost:11434/v1",
      localModel: "llama3",
      localRequireKey: false,
      localApiKey: "",
      apiKey: "",
      model: "gpt-4o",
      temperature: 0.3,
      doctorContext: "",
      anonymizeEnabled: true
    },
    (items) => {
      providerSelect.value = items.provider;
      scalewayApiKeyInput.value = items.scalewayApiKey;
      scalewayProjectIdInput.value = items.scalewayProjectId || "";
      scalewayModelSelect.value = items.scalewayModel;
      localServerUrlInput.value = items.localServerUrl;
      localModelInput.value = items.localModel;
      localRequireKeyCheckbox.checked = items.localRequireKey;
      localApiKeyInput.value = items.localApiKey;
      openaiApiKeyInput.value = items.apiKey;
      modelSelect.value = items.model;
      temperatureSlider.value = items.temperature;
      tempValueDisplay.textContent = items.temperature;
      doctorContextTextarea.value = items.doctorContext;
      anonymizeCheckbox.checked = items.anonymizeEnabled;

      // Appliquer l'état initial
      updateProviderFields();
      localKeyGroup.classList.toggle("hidden", !items.localRequireKey);
    }
  );

  // -------------------------------------------------------------------------
  // 5. Mise à jour en temps réel du slider
  // -------------------------------------------------------------------------
  temperatureSlider.addEventListener("input", () => {
    tempValueDisplay.textContent = temperatureSlider.value;
  });

  // -------------------------------------------------------------------------
  // 6. Test de connexion au serveur local
  // -------------------------------------------------------------------------
  testConnectionBtn.addEventListener("click", async () => {
    testConnectionBtn.disabled = true;
    testConnectionBtn.textContent = "⏳ Test en cours...";
    testResultSpan.textContent = "";
    testResultSpan.className = "test-result";

    try {
      const config = {
        localServerUrl: localServerUrlInput.value.trim(),
        localRequireKey: localRequireKeyCheckbox.checked,
        localApiKey: localApiKeyInput.value.trim()
      };

      const result = await chrome.runtime.sendMessage({
        action: "testConnection",
        config: config
      });

      if (result && result.ok) {
        testResultSpan.textContent = "✅ Connecté";
        testResultSpan.className = "test-result success";
      } else {
        testResultSpan.textContent = "❌ " + (result?.error || "Erreur inconnue");
        testResultSpan.className = "test-result error";
      }
    } catch (err) {
      testResultSpan.textContent = "❌ " + err.message;
      testResultSpan.className = "test-result error";
    }

    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = "🔗 Tester la connexion";
  });

  // -------------------------------------------------------------------------
  // 6bis. Test de connexion Scaleway
  // -------------------------------------------------------------------------
  const testScalewayBtn = document.getElementById("test-scaleway-btn");
  const testScalewayResult = document.getElementById("test-scaleway-result");
  if (testScalewayBtn) {
    testScalewayBtn.addEventListener("click", async () => {
      testScalewayBtn.disabled = true;
      const oldLabel = testScalewayBtn.textContent;
      testScalewayBtn.textContent = "⏳ Test en cours...";
      testScalewayResult.textContent = "";
      testScalewayResult.style.color = "";

      try {
        const config = {
          scalewayApiKey: scalewayApiKeyInput.value.trim(),
          scalewayProjectId: scalewayProjectIdInput.value.trim(),
          scalewayModel: scalewayModelSelect.value
        };
        const result = await chrome.runtime.sendMessage({
          action: "testScaleway",
          config: config
        });
        if (result && result.ok) {
          testScalewayResult.textContent = "✅ " + (result.info || "Connexion réussie.");
          testScalewayResult.style.color = "#16A34A";
        } else {
          testScalewayResult.textContent = "❌ " + (result?.error || "Erreur inconnue");
          testScalewayResult.style.color = "#DC2626";
        }
      } catch (err) {
        testScalewayResult.textContent = "❌ " + err.message;
        testScalewayResult.style.color = "#DC2626";
      }

      testScalewayBtn.disabled = false;
      testScalewayBtn.textContent = oldLabel;
    });
  }

  // -------------------------------------------------------------------------
  // 7. Sauvegarder les paramètres
  // -------------------------------------------------------------------------
  saveBtn.addEventListener("click", () => {
    const settings = {
      provider: providerSelect.value,
      // Scaleway
      scalewayApiKey: scalewayApiKeyInput.value.trim(),
      scalewayProjectId: scalewayProjectIdInput.value.trim(),
      scalewayModel: scalewayModelSelect.value,
      // Local
      localServerUrl: localServerUrlInput.value.trim() || "http://localhost:11434/v1",
      localModel: localModelInput.value.trim() || "llama3",
      localRequireKey: localRequireKeyCheckbox.checked,
      localApiKey: localApiKeyInput.value.trim(),
      // OpenAI Direct
      apiKey: openaiApiKeyInput.value.trim(),
      // Commun
      model: modelSelect.value,
      temperature: parseFloat(temperatureSlider.value),
      doctorContext: doctorContextTextarea.value.trim(),
      anonymizeEnabled: anonymizeCheckbox.checked
    };

    chrome.storage.sync.set(settings, () => {
      saveBtn.textContent = "✅ Sauvegardé !";
      saveBtn.classList.add("success");
      showToast();

      setTimeout(() => {
        saveBtn.innerHTML = "💾 Sauvegarder les paramètres";
        saveBtn.classList.remove("success");
      }, 2000);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Toast
  // -------------------------------------------------------------------------
  function showToast() {
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2500);
  }

  // -------------------------------------------------------------------------
  // 9. Ctrl+S / Cmd+S
  // -------------------------------------------------------------------------
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveBtn.click();
    }
  });

  // =========================================================================
  // 10. Gestion des actions du menu contextuel (CRUD)
  // =========================================================================

  // Items par défaut (miroir de background.js MENU_ITEMS)
  const DEFAULT_MENU_ITEMS = [
    { id: "corriger_reformuler", title: "✏️ Corriger & Reformuler", prompt: `Tu es un rédacteur et correcteur expert en français médical. Effectue deux tâches sur le texte suivant : 1) Corrige toutes les fautes d'orthographe et de grammaire, 2) Reformule le texte pour le rendre plus clair, fluide et professionnel. Conserve rigoureusement le sens médical et la terminologie technique. Renvoie uniquement le texte final corrigé et reformulé, sans commentaire.` },
    { id: "repondre",           title: "💬 Répondre",             prompt: `Tu es un assistant de communication pour un médecin généraliste français. Génère une réponse professionnelle, empathique et adaptée au texte suivant. Le ton doit être courtois et médical. Renvoie uniquement la réponse.` },
    { id: "repondre_secretariat", title: "📞 Répondre Secrétariat", prompt: `Tu es la secrétaire médicale d'un cabinet de médecine générale en France. Génère une réponse professionnelle, chaleureuse et efficace au message patient suivant. Règles : 1) Vouvoie toujours le patient, ton courtois et rassurant, 2) Pour les demandes de RDV : propose de convenir d'un créneau et demande le motif si non précisé, 3) Pour les renouvellements d'ordonnance : confirme la prise en compte et précise que l'ordonnance sera préparée par le médecin, 4) Pour les demandes de résultats ou documents : indique le délai estimé ou la marche à suivre, 5) Pour les urgences : oriente vers le 15 (SAMU) ou le 112, 6) Ne donne JAMAIS d'avis médical ni de conseil thérapeutique — redirige vers une consultation, 7) Signe avec 'Le secrétariat du Dr [NOM DU MÉDECIN]'. Renvoie uniquement la réponse prête à envoyer.` },
    { id: "resumer",            title: "📋 Résumer",              prompt: `Tu assistes un médecin dans la synthèse rédactionnelle d'un texte. Résume le texte suivant de manière structurée en bullet points. Extrais : le motif/contexte, les éléments clés, les conclusions et les éléments à retenir. Sois concis. Le résumé est une aide rédactionnelle uniquement, le médecin reste seul responsable de l'analyse clinique.` },
    { id: "courrier_correspondance", title: "✉️ Brouillon de courrier", prompt: `Tu es un assistant de rédaction administrative pour un médecin généraliste français. À partir du contexte suivant, rédige un BROUILLON de courrier d'adressage à un confrère. Structure : formule d'appel confraternelle, motif d'adressage, éléments de contexte, question posée, formule de politesse. Laisse des [PLACEHOLDERS] pour toutes les informations à vérifier. Termine OBLIGATOIREMENT par : '[BROUILLON GÉNÉRÉ PAR IA — À RELIRE, CORRIGER ET VALIDER PAR LE MÉDECIN AVANT ENVOI]'.` },
    { id: "certificat_medical", title: "📜 Brouillon de certificat", prompt: `Tu es un assistant de rédaction administrative. Produis un BROUILLON de certificat médical à partir du contexte fourni, en respectant la forme habituelle. Règles strictes : 1) Ne mentionne JAMAIS de diagnostic, 2) N'utilise que des constatations objectives ('Je soussigné certifie avoir examiné ce jour...'), 3) Inclus 'Certificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit', 4) Prévois les champs [NOM DU MÉDECIN], [ADRESSE CABINET], [RPPS], [NOM PATIENT], [DATE DE NAISSANCE], [DATE DU JOUR]. Termine OBLIGATOIREMENT par : '[BROUILLON GÉNÉRÉ PAR IA — NON VALIDÉ — LE MÉDECIN EST SEUL RESPONSABLE DE LA RÉDACTION FINALE, DE SA CONFORMITÉ LÉGALE ET DE SA SIGNATURE]'.` },
    { id: "traduire_francais",  title: "🌐 Traduire en français",  prompt: `Tu es un traducteur professionnel. Traduis le texte suivant en français en conservant la terminologie technique. Renvoie uniquement la traduction.` }
  ];

  const menuList = document.getElementById("menu-items-list");
  const addActionBtn = document.getElementById("add-action-btn");
  const addActionForm = document.getElementById("add-action-form");
  const cancelAddBtn = document.getElementById("cancel-add-btn");
  const confirmAddBtn = document.getElementById("confirm-add-btn");
  const newTitleInput = document.getElementById("new-action-title");
  const newPromptInput = document.getElementById("new-action-prompt");

  let menuOverrides = {};
  let customMenuItems = [];

  // Charger et afficher
  function loadMenuItems() {
    chrome.storage.sync.get({ menuOverrides: {}, customMenuItems: [] }, (items) => {
      menuOverrides = items.menuOverrides || {};
      customMenuItems = items.customMenuItems || [];
      renderMenuItems();
    });
  }

  // Sauvegarder dans storage et reconstruire le menu
  function saveMenuState(callback) {
    chrome.storage.sync.set({ menuOverrides, customMenuItems }, () => {
      chrome.runtime.sendMessage({ action: "rebuildMenus" });
      if (callback) callback();
    });
  }

  // Rendu de la liste
  function renderMenuItems() {
    menuList.innerHTML = "";

    // Defaults
    for (const item of DEFAULT_MENU_ITEMS) {
      const ov = menuOverrides[item.id] || {};
      const enabled = ov.enabled !== false;
      const title = ov.title || item.title;
      const prompt = ov.prompt || item.prompt;
      const examples = Array.isArray(ov.examples) ? ov.examples : (item.examples || []);
      menuList.appendChild(buildRow({ id: item.id, title, prompt, examples, enabled, isDefault: true }));
    }

    // Custom
    for (const item of customMenuItems) {
      menuList.appendChild(buildRow({ ...item, examples: item.examples || [], isDefault: false }));
    }
  }

  // Construire une ligne item
  function buildRow({ id, title, prompt, examples, enabled, isDefault }) {
    const wrapper = document.createElement("div");

    const row = document.createElement("div");
    row.className = "menu-item-row";

    // Toggle
    const toggleLabel = document.createElement("label");
    toggleLabel.className = "menu-item-toggle";
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = enabled !== false;
    const toggleSlider = document.createElement("span");
    toggleSlider.className = "toggle-slider";
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);

    // Label
    const labelEl = document.createElement("span");
    labelEl.className = "menu-item-label" + (enabled === false ? " disabled" : "");
    labelEl.textContent = title;

    // Badge
    const badge = document.createElement("span");
    badge.className = "menu-item-badge " + (isDefault ? "badge-default" : "badge-custom");
    badge.textContent = isDefault ? "Défaut" : "Perso";

    // Boutons
    const actionsEl = document.createElement("div");
    actionsEl.className = "menu-item-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.title = "Modifier";
    editBtn.textContent = "✏️";

    actionsEl.appendChild(editBtn);

    if (!isDefault) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn danger";
      delBtn.title = "Supprimer";
      delBtn.textContent = "🗑️";
      delBtn.addEventListener("click", () => {
        if (!confirm(`Supprimer "${title}" ?`)) return;
        customMenuItems = customMenuItems.filter(m => m.id !== id);
        saveMenuState(() => renderMenuItems());
      });
      actionsEl.appendChild(delBtn);
    }

    // Reset prompt (défaut seulement, si override)
    if (isDefault && menuOverrides[id]?.prompt) {
      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "icon-btn";
      resetBtn.title = "Restaurer le prompt par défaut";
      resetBtn.textContent = "↩️";
      resetBtn.addEventListener("click", () => {
        if (!confirm("Restaurer le prompt original ?")) return;
        const ov = menuOverrides[id] || {};
        delete ov.prompt;
        delete ov.title;
        if (Object.keys(ov).length === 0) delete menuOverrides[id];
        else menuOverrides[id] = ov;
        saveMenuState(() => renderMenuItems());
      });
      actionsEl.appendChild(resetBtn);
    }

    row.appendChild(toggleLabel);
    row.appendChild(labelEl);
    row.appendChild(badge);
    row.appendChild(actionsEl);

    // Toggle handler
    toggleInput.addEventListener("change", () => {
      const isEnabled = toggleInput.checked;
      labelEl.classList.toggle("disabled", !isEnabled);
      if (isDefault) {
        menuOverrides[id] = { ...(menuOverrides[id] || {}), enabled: isEnabled };
      } else {
        const idx = customMenuItems.findIndex(m => m.id === id);
        if (idx >= 0) customMenuItems[idx].enabled = isEnabled;
      }
      saveMenuState();
    });

    // Panneau d'édition
    const editPanel = document.createElement("div");
    editPanel.className = "edit-panel";

    const inner = document.createElement("div");
    inner.className = "edit-panel-inner";

    // Titre (toujours modifiable)
    const titleLabel = document.createElement("label");
    titleLabel.textContent = "Titre de l'action";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = title;
    titleInput.placeholder = "Ex: ✏️ Mon action";

    // Prompt
    const promptLabel = document.createElement("label");
    promptLabel.textContent = "Prompt système";
    const promptTextarea = document.createElement("textarea");
    promptTextarea.value = prompt;
    promptTextarea.rows = 6;
    promptTextarea.placeholder = "Instruction envoyée à l'IA...";

    // ─── Section Exemples (few-shot) ────────────────────────────────
    const examplesHeader = document.createElement("label");
    examplesHeader.textContent = "Exemples (few-shot)";
    examplesHeader.style.marginTop = "16px";

    const examplesHelp = document.createElement("p");
    examplesHelp.className = "api-help";
    examplesHelp.innerHTML = "Montrez à l'IA 2 à 4 paires <strong>entrée → sortie attendue</strong>. Cela force le modèle à imiter EXACTEMENT votre format de sortie, et empêche toute dérive. Très efficace avec les modèles open-source (Mistral, GPT-OSS).";

    const examplesList = document.createElement("div");
    examplesList.className = "examples-list";

    // État local des exemples
    const localExamples = Array.isArray(examples) ? examples.map(e => ({ input: e.input || "", output: e.output || "" })) : [];

    function renderExamples() {
      examplesList.innerHTML = "";
      if (localExamples.length === 0) {
        const empty = document.createElement("p");
        empty.className = "api-help";
        empty.style.fontStyle = "italic";
        empty.textContent = "Aucun exemple pour le moment.";
        examplesList.appendChild(empty);
      }
      localExamples.forEach((ex, idx) => {
        const card = document.createElement("div");
        card.className = "example-card";

        const cardHeader = document.createElement("div");
        cardHeader.className = "example-card-header";
        const num = document.createElement("strong");
        num.textContent = `Exemple ${idx + 1}`;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "icon-btn danger";
        removeBtn.title = "Supprimer cet exemple";
        removeBtn.textContent = "🗑️";
        removeBtn.addEventListener("click", () => {
          localExamples.splice(idx, 1);
          renderExamples();
        });
        cardHeader.appendChild(num);
        cardHeader.appendChild(removeBtn);

        const inputLabel = document.createElement("label");
        inputLabel.textContent = "Entrée";
        const inputArea = document.createElement("textarea");
        inputArea.value = ex.input;
        inputArea.rows = 2;
        inputArea.placeholder = "Texte d'exemple en entrée";
        inputArea.addEventListener("input", () => { localExamples[idx].input = inputArea.value; });

        const outputLabel = document.createElement("label");
        outputLabel.textContent = "Sortie attendue";
        const outputArea = document.createElement("textarea");
        outputArea.value = ex.output;
        outputArea.rows = 3;
        outputArea.placeholder = "Sortie idéale attendue pour cette entrée";
        outputArea.addEventListener("input", () => { localExamples[idx].output = outputArea.value; });

        card.appendChild(cardHeader);
        card.appendChild(inputLabel);
        card.appendChild(inputArea);
        card.appendChild(outputLabel);
        card.appendChild(outputArea);
        examplesList.appendChild(card);
      });
    }
    renderExamples();

    const addExampleBtn = document.createElement("button");
    addExampleBtn.type = "button";
    addExampleBtn.className = "btn-sm btn-sm-ghost";
    addExampleBtn.style.marginTop = "8px";
    addExampleBtn.textContent = "➕ Ajouter un exemple";
    addExampleBtn.addEventListener("click", () => {
      localExamples.push({ input: "", output: "" });
      renderExamples();
    });

    const panelActions = document.createElement("div");
    panelActions.className = "edit-panel-actions";

    const cancelBtn2 = document.createElement("button");
    cancelBtn2.type = "button";
    cancelBtn2.className = "btn-sm btn-sm-ghost";
    cancelBtn2.textContent = "Annuler";
    cancelBtn2.addEventListener("click", () => {
      editPanel.classList.remove("open");
      editBtn.textContent = "✏️";
    });

    const saveBtn2 = document.createElement("button");
    saveBtn2.type = "button";
    saveBtn2.className = "btn-sm btn-sm-primary";
    saveBtn2.textContent = "💾 Sauvegarder";
    saveBtn2.addEventListener("click", () => {
      const newTitle = titleInput.value.trim();
      const newPrompt = promptTextarea.value.trim();
      if (!newTitle || !newPrompt) { alert("Le titre et le prompt sont obligatoires."); return; }

      // Filtrer les exemples : ne garder que ceux qui ont entrée ET sortie
      const cleanedExamples = localExamples
        .map(e => ({ input: (e.input || "").trim(), output: (e.output || "").trim() }))
        .filter(e => e.input && e.output);

      if (isDefault) {
        menuOverrides[id] = {
          ...(menuOverrides[id] || {}),
          title: newTitle,
          prompt: newPrompt,
          examples: cleanedExamples
        };
      } else {
        const idx = customMenuItems.findIndex(m => m.id === id);
        if (idx >= 0) {
          customMenuItems[idx].title = newTitle;
          customMenuItems[idx].prompt = newPrompt;
          customMenuItems[idx].examples = cleanedExamples;
        }
      }
      saveMenuState(() => {
        editPanel.classList.remove("open");
        editBtn.textContent = "✏️";
        renderMenuItems();
        showToast();
      });
    });

    panelActions.appendChild(cancelBtn2);
    panelActions.appendChild(saveBtn2);
    inner.appendChild(titleLabel);
    inner.appendChild(titleInput);
    inner.appendChild(promptLabel);
    inner.appendChild(promptTextarea);
    inner.appendChild(examplesHeader);
    inner.appendChild(examplesHelp);
    inner.appendChild(examplesList);
    inner.appendChild(addExampleBtn);
    inner.appendChild(panelActions);
    editPanel.appendChild(inner);

    // Toggle édition
    editBtn.addEventListener("click", () => {
      const isOpen = editPanel.classList.contains("open");
      // Fermer tous les autres panneaux
      document.querySelectorAll(".edit-panel.open").forEach(p => p.classList.remove("open"));
      document.querySelectorAll(".icon-btn").forEach(b => { if (b.textContent === "✖️") b.textContent = "✏️"; });
      if (!isOpen) {
        editPanel.classList.add("open");
        editBtn.textContent = "✖️";
      }
    });

    wrapper.appendChild(row);
    wrapper.appendChild(editPanel);
    return wrapper;
  }

  // Ajouter une nouvelle action
  addActionBtn.addEventListener("click", () => {
    addActionForm.classList.toggle("open");
    addActionBtn.textContent = addActionForm.classList.contains("open") ? "✖️ Annuler" : "➕ Ajouter une action personnalisée";
  });

  cancelAddBtn.addEventListener("click", () => {
    addActionForm.classList.remove("open");
    addActionBtn.textContent = "➕ Ajouter une action personnalisée";
    newTitleInput.value = "";
    newPromptInput.value = "";
  });

  confirmAddBtn.addEventListener("click", () => {
    const title = newTitleInput.value.trim();
    const prompt = newPromptInput.value.trim();
    if (!title || !prompt) { alert("Le titre et le prompt sont obligatoires."); return; }

    const newItem = {
      id: "custom_" + Date.now(),
      title,
      prompt,
      enabled: true
    };
    customMenuItems.push(newItem);
    saveMenuState(() => {
      renderMenuItems();
      cancelAddBtn.click();
      showToast();
    });
  });

  // Initialisation
  loadMenuItems();

})();
