// ============================================================================
// options.js — Logique de la page d'options multi-fournisseurs
// Sauvegarde et restauration via chrome.storage.sync
// ============================================================================

(() => {
  // -------------------------------------------------------------------------
  // Références DOM
  // -------------------------------------------------------------------------
  const providerSelect = document.getElementById("provider");

  // Scaleway
  const scalewayApiKeyInput = document.getElementById("scaleway-api-key");
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
      scalewayModel: "qwen3.5-397b-a17b",
      localServerUrl: "http://localhost:11434/v1",
      localModel: "llama3",
      localRequireKey: false,
      localApiKey: "",
      apiKey: "",
      model: "gpt-4o",
      temperature: 0.3,
      doctorContext: ""
    },
    (items) => {
      providerSelect.value = items.provider;
      scalewayApiKeyInput.value = items.scalewayApiKey;
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
  // 7. Sauvegarder les paramètres
  // -------------------------------------------------------------------------
  saveBtn.addEventListener("click", () => {
    const settings = {
      provider: providerSelect.value,
      // Scaleway
      scalewayApiKey: scalewayApiKeyInput.value.trim(),
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
      doctorContext: doctorContextTextarea.value.trim()
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

})();
