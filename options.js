// ============================================================================
// options.js — Page d'options (module ES)
// Réglages via lib/settings.js (secrets en storage.local, préférences en sync),
// actions du menu via lib/menu-store.js (une clé par action), défauts partagés
// avec le Service Worker via lib/menu-defaults.js.
// ============================================================================

import { MENU_ITEMS } from "./lib/menu-defaults.js";
import { loadSettings, saveSettings, exportableSettings, DEFAULT_SETTINGS, SECRET_KEYS } from "./lib/settings.js";
import { loadMenuConfig, saveMenuItem, removeMenuItem, resolveMenuItems, MAX_ITEM_BYTES } from "./lib/menu-store.js";
import { remoteOriginPattern, resolveModelId } from "./lib/utils.js";

const CGU_VERSION = "1.0";
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Version (depuis le manifest)
// ---------------------------------------------------------------------------
{
  const v = chrome.runtime.getManifest().version;
  $("version-pill").textContent = `v${v}`;
  $("version-footer").textContent = `v${v}`;
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
const toast = $("toast");
const toastText = $("toast-text");
let toastTimer = null;
function showToast(message = "Paramètres sauvegardés", isError = false) {
  toastText.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), isError ? 5000 : 2500);
}

function storageErrorMessage(err) {
  if (err && err.message === "QUOTA") {
    return `Cette action est trop volumineuse pour être synchronisée (${err.size} octets, limite ${MAX_ITEM_BYTES}). Raccourcissez le prompt ou les exemples.`;
  }
  const msg = (err && err.message) || String(err);
  if (/QUOTA/i.test(msg)) return "Espace de synchronisation Chrome saturé. Réduisez les prompts / exemples ou supprimez des actions.";
  return `Enregistrement impossible : ${msg}`;
}

// ---------------------------------------------------------------------------
// CGU — acceptation obligatoire au premier lancement
// ---------------------------------------------------------------------------
const cguOverlay = $("cgu-overlay");
const cguCheckbox = $("cgu-accept-checkbox");
const cguAcceptBtn = $("cgu-accept-btn");

cguCheckbox.addEventListener("change", () => { cguAcceptBtn.disabled = !cguCheckbox.checked; });

cguAcceptBtn.addEventListener("click", async () => {
  if (!cguCheckbox.checked) return;
  await saveSettings({ cguAccepted: CGU_VERSION, cguAcceptedAt: new Date().toISOString() });
  cguOverlay.classList.add("hidden");
});

$("review-cgu-btn").addEventListener("click", () => {
  cguCheckbox.checked = false;
  cguAcceptBtn.disabled = true;
  cguOverlay.classList.remove("hidden");
});

$("revoke-cgu-link").addEventListener("click", async (e) => {
  e.preventDefault();
  if (!confirm("Révoquer l'acceptation des CGU ? Elles devront être acceptées à nouveau.")) return;
  await saveSettings({ cguAccepted: "", cguAcceptedAt: "" });
  cguCheckbox.checked = false;
  cguAcceptBtn.disabled = true;
  cguOverlay.classList.remove("hidden");
});

// ---------------------------------------------------------------------------
// Références DOM
// ---------------------------------------------------------------------------
const providerSelect = $("provider");
const fields = { scaleway: $("fields-scaleway"), local: $("fields-local"), openai: $("fields-openai"), openrouter: $("fields-openrouter") };

const scalewayApiKeyInput = $("scaleway-api-key");
const scalewayProjectIdInput = $("scaleway-project-id");
const scalewayModelInput = $("scaleway-model");

const localServerUrlInput = $("local-server-url");
const localModelInput = $("local-model");
const localRequireKeyCheckbox = $("local-require-key");
const localApiKeyInput = $("local-api-key");
const localKeyGroup = $("local-key-group");
const localRemoteHint = $("local-remote-hint");
const testConnectionBtn = $("test-connection-btn");
const testResultSpan = $("test-result");

const openaiApiKeyInput = $("openai-api-key");
const modelInput = $("model");
const modelGroup = $("model-group");

const openrouterApiKeyInput = $("openrouter-api-key");
const openrouterModelInput = $("openrouter-model");

const temperatureSlider = $("temperature");
const tempValueDisplay = $("temp-value");
const streamEnabledCheckbox = $("stream-enabled");
const maxTokensSelect = $("max-tokens");
const quickActionSelect = $("quick-action");
const doctorContextTextarea = $("doctor-context");

const anonymizeCheckbox = $("anonymize-enabled");
const rehydrateCheckbox = $("rehydrate-enabled");
const confirmBeforeSendCheckbox = $("confirm-before-send");
const customAcronymsInput = $("custom-acronyms");

const saveBtn = $("save-btn");

// ---------------------------------------------------------------------------
// 1. Affichage des champs selon le fournisseur
// ---------------------------------------------------------------------------
function updateProviderFields() {
  const provider = providerSelect.value;
  for (const [k, node] of Object.entries(fields)) node.classList.toggle("active", provider === k);
  modelGroup.style.display = provider === "openai" ? "" : "none";
}
providerSelect.addEventListener("change", updateProviderFields);

localRequireKeyCheckbox.addEventListener("change", () => {
  localKeyGroup.classList.toggle("hidden", !localRequireKeyCheckbox.checked);
});

document.querySelectorAll(".toggle-password").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = $(btn.getAttribute("data-target"));
    if (!input) return;
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    btn.textContent = isPassword ? "🔒" : "👁️";
  });
});

temperatureSlider.addEventListener("input", () => { tempValueDisplay.textContent = temperatureSlider.value; });

// ---------------------------------------------------------------------------
// 2. Serveur distant (Tailscale, LAN, VPN) — autorisation d'origine
// ---------------------------------------------------------------------------
/**
 * Demande à Chrome l'accès à l'origine du serveur si nécessaire. Doit être le
 * PREMIER await d'un gestionnaire de clic / raccourci clavier (geste utilisateur).
 */
async function ensureRemoteOriginPermission(urlString) {
  const pattern = remoteOriginPattern(urlString);
  if (!pattern) return true;
  try {
    return await chrome.permissions.request({ origins: [pattern] });
  } catch (_) {
    return false;
  }
}

async function updateRemoteHint(deniedPattern = null) {
  const pattern = remoteOriginPattern(localServerUrlInput.value.trim());
  if (!pattern) { localRemoteHint.classList.add("hidden"); return; }
  localRemoteHint.classList.remove("hidden");

  if (deniedPattern) {
    localRemoteHint.textContent = `⚠️ Autorisation refusée pour ${deniedPattern} — Dachi ne pourra pas joindre ce serveur. Cliquez sur « Tester la connexion » pour la redemander.`;
    localRemoteHint.style.color = "var(--danger-text)";
    return;
  }
  let granted = false;
  try { granted = await chrome.permissions.contains({ origins: [pattern] }); } catch (_) {}
  localRemoteHint.textContent = granted
    ? `✅ Serveur distant autorisé (${pattern}).`
    : `🔐 Serveur distant détecté : Chrome demandera l'autorisation d'accéder à ${pattern} lors du test ou de la sauvegarde.`;
  localRemoteHint.style.color = granted ? "var(--success-text)" : "";
}
localServerUrlInput.addEventListener("input", () => updateRemoteHint());

// ---------------------------------------------------------------------------
// 3. Lecture des champs → objet réglages
// ---------------------------------------------------------------------------
function readForm() {
  return {
    provider: providerSelect.value,
    scalewayApiKey: scalewayApiKeyInput.value.trim(),
    scalewayProjectId: scalewayProjectIdInput.value.trim(),
    scalewayModel: scalewayModelInput.value.trim() || DEFAULT_SETTINGS.scalewayModel,
    localServerUrl: localServerUrlInput.value.trim() || DEFAULT_SETTINGS.localServerUrl,
    localModel: localModelInput.value.trim() || DEFAULT_SETTINGS.localModel,
    localRequireKey: localRequireKeyCheckbox.checked,
    localApiKey: localApiKeyInput.value.trim(),
    apiKey: openaiApiKeyInput.value.trim(),
    model: modelInput.value.trim() || DEFAULT_SETTINGS.model,
    openrouterApiKey: openrouterApiKeyInput.value.trim(),
    openrouterModel: resolveModelInput("openrouter") || DEFAULT_SETTINGS.openrouterModel,
    temperature: parseFloat(temperatureSlider.value),
    streamEnabled: streamEnabledCheckbox.checked,
    maxTokens: parseInt(maxTokensSelect.value, 10) || DEFAULT_SETTINGS.maxTokens,
    quickActionId: quickActionSelect.value || DEFAULT_SETTINGS.quickActionId,
    doctorContext: doctorContextTextarea.value.trim(),
    anonymizeEnabled: anonymizeCheckbox.checked,
    rehydrateEnabled: rehydrateCheckbox.checked,
    confirmBeforeSend: confirmBeforeSendCheckbox.checked,
    customAcronyms: customAcronymsInput.value.trim()
  };
}

function fillForm(s) {
  providerSelect.value = s.provider;
  scalewayApiKeyInput.value = s.scalewayApiKey;
  scalewayProjectIdInput.value = s.scalewayProjectId || "";
  scalewayModelInput.value = s.scalewayModel;
  localServerUrlInput.value = s.localServerUrl;
  localModelInput.value = s.localModel;
  localRequireKeyCheckbox.checked = s.localRequireKey;
  localApiKeyInput.value = s.localApiKey;
  openaiApiKeyInput.value = s.apiKey;
  modelInput.value = s.model;
  openrouterApiKeyInput.value = s.openrouterApiKey || "";
  openrouterModelInput.value = s.openrouterModel || "";
  temperatureSlider.value = s.temperature;
  tempValueDisplay.textContent = s.temperature;
  streamEnabledCheckbox.checked = s.streamEnabled;
  maxTokensSelect.value = String(s.maxTokens || DEFAULT_SETTINGS.maxTokens);
  if (maxTokensSelect.value !== String(s.maxTokens || DEFAULT_SETTINGS.maxTokens)) maxTokensSelect.value = String(DEFAULT_SETTINGS.maxTokens);
  doctorContextTextarea.value = s.doctorContext;
  anonymizeCheckbox.checked = s.anonymizeEnabled;
  rehydrateCheckbox.checked = s.rehydrateEnabled;
  confirmBeforeSendCheckbox.checked = s.confirmBeforeSend;
  customAcronymsInput.value = s.customAcronyms || "";
  quickActionSelect.value = s.quickActionId;

  updateProviderFields();
  localKeyGroup.classList.toggle("hidden", !s.localRequireKey);
  updateRemoteHint();
}

// ---------------------------------------------------------------------------
// 4. Tests de connexion
// ---------------------------------------------------------------------------
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
    if (!(await ensureRemoteOriginPermission(config.localServerUrl))) {
      updateRemoteHint(remoteOriginPattern(config.localServerUrl));
      throw new Error(`Autorisation refusée pour ${remoteOriginPattern(config.localServerUrl)}`);
    }
    updateRemoteHint();

    const result = await chrome.runtime.sendMessage({ action: "testConnection", config });
    testResultSpan.textContent = result && result.ok ? "✅ Connecté" : "❌ " + (result?.error || "Erreur inconnue");
    testResultSpan.className = "test-result " + (result && result.ok ? "success" : "error");
  } catch (err) {
    testResultSpan.textContent = "❌ " + err.message;
    testResultSpan.className = "test-result error";
  }

  testConnectionBtn.disabled = false;
  testConnectionBtn.textContent = "🔗 Tester la connexion";
});

const testScalewayBtn = $("test-scaleway-btn");
const testScalewayResult = $("test-scaleway-result");
testScalewayBtn.addEventListener("click", async () => {
  testScalewayBtn.disabled = true;
  const oldLabel = testScalewayBtn.textContent;
  testScalewayBtn.textContent = "⏳ Test en cours...";
  testScalewayResult.textContent = "";
  testScalewayResult.style.color = "";

  try {
    const result = await chrome.runtime.sendMessage({
      action: "testScaleway",
      config: {
        scalewayApiKey: scalewayApiKeyInput.value.trim(),
        scalewayProjectId: scalewayProjectIdInput.value.trim(),
        scalewayModel: scalewayModelInput.value.trim()
      }
    });
    testScalewayResult.textContent = result && result.ok ? "✅ " + (result.info || "Connexion réussie.") : "❌ " + (result?.error || "Erreur inconnue");
    testScalewayResult.style.color = result && result.ok ? "var(--success-text)" : "var(--danger-text)";
  } catch (err) {
    testScalewayResult.textContent = "❌ " + err.message;
    testScalewayResult.style.color = "var(--danger-text)";
  }

  testScalewayBtn.disabled = false;
  testScalewayBtn.textContent = oldLabel;
});

const testOpenRouterBtn = $("test-openrouter-btn");
const testOpenRouterResult = $("test-openrouter-result");
testOpenRouterBtn.addEventListener("click", async () => {
  testOpenRouterBtn.disabled = true;
  const oldLabel = testOpenRouterBtn.textContent;
  testOpenRouterBtn.textContent = "⏳ Test en cours...";
  testOpenRouterResult.textContent = "";
  testOpenRouterResult.style.color = "";

  try {
    const result = await chrome.runtime.sendMessage({
      action: "testOpenRouter",
      config: {
        openrouterApiKey: openrouterApiKeyInput.value.trim(),
        openrouterModel: resolveModelInput("openrouter")
      }
    });
    testOpenRouterResult.textContent = result && result.ok ? "✅ " + (result.info || "Connexion réussie.") : "❌ " + (result?.error || "Erreur inconnue");
    testOpenRouterResult.style.color = result && result.ok ? "var(--success-text)" : "var(--danger-text)";
  } catch (err) {
    testOpenRouterResult.textContent = "❌ " + err.message;
    testOpenRouterResult.style.color = "var(--danger-text)";
  }

  testOpenRouterBtn.disabled = false;
  testOpenRouterBtn.textContent = oldLabel;
});

// ---------------------------------------------------------------------------
// 5. Liste des modèles (GET /v1/models du fournisseur)
// ---------------------------------------------------------------------------
const MODEL_LIST_INPUTS = { scaleway: scalewayModelInput, local: localModelInput, openai: modelInput, openrouter: openrouterModelInput };
const MODEL_LIST_IDS = { scaleway: "scaleway-models", local: "local-models", openai: "openai-models", openrouter: "openrouter-models" };

// Catalogues chargés (par fournisseur) : [{ id, name }]
const modelCaches = {};

function normalizeModelList(models) {
  return (models || []).map(m => (typeof m === "string" ? { id: m, name: m } : m)).filter(m => m && m.id);
}

function fillDatalist(provider, models) {
  const list = normalizeModelList(models);
  modelCaches[provider] = list;
  const dl = $(MODEL_LIST_IDS[provider]);
  dl.innerHTML = "";
  for (const m of list) {
    const opt = document.createElement("option");
    opt.value = m.id;
    if (m.name && m.name !== m.id) opt.label = m.name;   // Chrome affiche « id — nom » et filtre sur les deux
    dl.appendChild(opt);
  }
}

/**
 * Remplace un nom d'affichage saisi (« Ling 3.0 Flash VL ») par l'identifiant
 * attendu par l'API (« inclusionai/ling-3.0-flash-vl ») quand le catalogue le
 * permet. Renvoie l'identifiant retenu.
 */
function resolveModelInput(provider) {
  const input = MODEL_LIST_INPUTS[provider];
  const help = document.querySelector(`[data-models-help="${provider}"]`);
  const value = input.value.trim();
  const list = modelCaches[provider] || [];
  if (!value) return value;
  if (!list.length) {
    if (provider === "openrouter" && !value.includes("/") && help) {
      help.textContent = `⚠️ L'API attend un identifiant « fournisseur/modèle ». Cliquez sur « Actualiser » : le nom « ${value} » sera résolu automatiquement.`;
      help.style.color = "var(--warning-text)";
    }
    return value;
  }
  const resolved = resolveModelId(value, list);
  if (resolved && resolved !== value) {
    input.value = resolved;
    if (help) { help.textContent = `↪ « ${value} » résolu en « ${resolved} ».`; help.style.color = "var(--success-text)"; }
    return resolved;
  }
  if (!resolved && provider === "openrouter" && !value.includes("/") && help) {
    help.textContent = `⚠️ « ${value} » ne correspond à aucun modèle du catalogue — l'API attend un identifiant « fournisseur/modèle ».`;
    help.style.color = "var(--warning-text)";
  }
  return value;
}

for (const provider of Object.keys(MODEL_LIST_INPUTS)) {
  MODEL_LIST_INPUTS[provider].addEventListener("change", () => resolveModelInput(provider));
}

document.querySelectorAll("[data-list-models]").forEach(btn => {
  btn.addEventListener("click", async () => {
    const provider = btn.getAttribute("data-list-models");
    const help = document.querySelector(`[data-models-help="${provider}"]`);
    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = "⏳";
    help.style.color = "";

    try {
      const config = readForm();
      if (provider === "local" && !(await ensureRemoteOriginPermission(config.localServerUrl))) {
        throw new Error("Autorisation Chrome refusée pour ce serveur.");
      }
      const result = await chrome.runtime.sendMessage({ action: "listModels", provider, config });
      if (!result || !result.ok) throw new Error(result?.error || "Erreur inconnue");
      fillDatalist(provider, result.models);
      await chrome.storage.local.set({ [`modelCache_${provider}`]: modelCaches[provider] });
      const count = modelCaches[provider].length;
      help.textContent = count
        ? `${count} modèle${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} — tapez un nom ou un identifiant dans le champ pour filtrer.`
        : "Aucun modèle renvoyé par le fournisseur.";
      if (count && !MODEL_LIST_INPUTS[provider].value.trim()) {
        MODEL_LIST_INPUTS[provider].value = modelCaches[provider][0].id;
      } else {
        resolveModelInput(provider);
      }
    } catch (err) {
      help.textContent = "❌ " + err.message;
      help.style.color = "var(--danger-text)";
    }

    btn.disabled = false;
    btn.textContent = oldLabel;
  });
});

async function restoreModelCaches() {
  const cache = await chrome.storage.local.get(Object.keys(MODEL_LIST_IDS).map(p => `modelCache_${p}`));
  for (const provider of Object.keys(MODEL_LIST_IDS)) {
    const list = cache[`modelCache_${provider}`];
    if (Array.isArray(list) && list.length) fillDatalist(provider, list);
  }
}

// ---------------------------------------------------------------------------
// 6. Raccourci clavier
// ---------------------------------------------------------------------------
$("shortcuts-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// ---------------------------------------------------------------------------
// 7. Sauvegarder
// ---------------------------------------------------------------------------
saveBtn.addEventListener("click", async () => {
  const settings = readForm();

  // Serveur distant : demander l'autorisation AVANT toute autre opération
  // asynchrone (geste utilisateur requis). Un refus n'empêche pas la sauvegarde.
  let deniedPattern = null;
  if (settings.provider === "local" && !(await ensureRemoteOriginPermission(settings.localServerUrl))) {
    deniedPattern = remoteOriginPattern(settings.localServerUrl);
  }

  try {
    await saveSettings(settings);
  } catch (err) {
    showToast(storageErrorMessage(err), true);
    return;
  }

  saveBtn.textContent = "Sauvegardé ✓";
  saveBtn.classList.add("success");
  showToast();
  updateRemoteHint(deniedPattern);
  setTimeout(() => {
    saveBtn.textContent = "Sauvegarder les paramètres";
    saveBtn.classList.remove("success");
  }, 2000);
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveBtn.click();
  }
});

// ===========================================================================
// 8. Actions du menu contextuel (CRUD)
// ===========================================================================
const menuList = $("menu-items-list");
const addActionBtn = $("add-action-btn");
const addActionForm = $("add-action-form");
const newTitleInput = $("new-action-title");
const newPromptInput = $("new-action-prompt");
const cancelAddBtn = $("cancel-add-btn");
const confirmAddBtn = $("confirm-add-btn");

let menuConfig = { overrides: {}, custom: [] };

async function loadMenuItems() {
  menuConfig = await loadMenuConfig();
  renderMenuItems();
}

function currentItems() {
  return resolveMenuItems(MENU_ITEMS, menuConfig);
}

function renderMenuItems() {
  menuList.innerHTML = "";
  const items = currentItems();
  for (const item of items) menuList.appendChild(buildRow(item));
  renderQuickActionOptions(items);
}

function renderQuickActionOptions(items) {
  const current = quickActionSelect.value || DEFAULT_SETTINGS.quickActionId;
  quickActionSelect.innerHTML = "";
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.title + (item.enabled ? "" : " (désactivée)");
    quickActionSelect.appendChild(opt);
  }
  quickActionSelect.value = items.some(i => i.id === current) ? current : (items[0] ? items[0].id : "");
}

/** Persiste une action puis re-rend ; affiche l'erreur (quota…) le cas échéant. */
async function persistItem(item, data, onDone) {
  try {
    if (item.isDefault) {
      if (Object.keys(data).length === 0) {
        await removeMenuItem(item.id);
        delete menuConfig.overrides[item.id];
      } else {
        await saveMenuItem(item.id, data);
        menuConfig.overrides[item.id] = data;
      }
    } else {
      await saveMenuItem(item.id, { custom: true, ...data });
      const idx = menuConfig.custom.findIndex(c => c.id === item.id);
      const entry = { id: item.id, title: data.title, prompt: data.prompt, examples: data.examples || [], enabled: data.enabled !== false };
      if (idx >= 0) menuConfig.custom[idx] = entry; else menuConfig.custom.push(entry);
    }
    chrome.runtime.sendMessage({ action: "rebuildMenus" }).catch(() => {});
    if (onDone) onDone();
    return true;
  } catch (err) {
    showToast(storageErrorMessage(err), true);
    return false;
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function iconButton(label, title, extraClass = "") {
  const b = el("button", `icon-btn ${extraClass}`.trim(), label);
  b.type = "button";
  b.title = title;
  return b;
}

function buildRow(item) {
  const { id, title, prompt, examples, enabled, isDefault, override } = item;
  const wrapper = document.createElement("div");

  const row = el("div", "menu-item-row");

  // Toggle
  const toggleLabel = el("label", "menu-item-toggle");
  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = enabled;
  toggleInput.setAttribute("aria-label", `Activer ${title}`);
  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(el("span", "toggle-slider"));

  const labelEl = el("span", "menu-item-label" + (enabled ? "" : " disabled"), title);
  const badge = el("span", "menu-item-badge " + (isDefault ? "badge-default" : "badge-custom"), isDefault ? "Défaut" : "Perso");

  const actionsEl = el("div", "menu-item-actions");
  const editBtn = iconButton("✏️", "Modifier");
  actionsEl.appendChild(editBtn);

  if (!isDefault) {
    const delBtn = iconButton("🗑️", "Supprimer", "danger");
    delBtn.addEventListener("click", async () => {
      if (!confirm(`Supprimer "${title}" ?`)) return;
      try {
        await removeMenuItem(id);
        menuConfig.custom = menuConfig.custom.filter(c => c.id !== id);
        chrome.runtime.sendMessage({ action: "rebuildMenus" }).catch(() => {});
        renderMenuItems();
      } catch (err) {
        showToast(storageErrorMessage(err), true);
      }
    });
    actionsEl.appendChild(delBtn);
  }

  if (isDefault && override && (override.prompt || override.title || override.examples)) {
    const resetBtn = iconButton("↩️", "Restaurer le prompt et les exemples par défaut");
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Restaurer le prompt, le titre et les exemples d'origine ?")) return;
      const data = {};
      if (override.enabled === false) data.enabled = false;
      await persistItem(item, data, renderMenuItems);
    });
    actionsEl.appendChild(resetBtn);
  }

  row.appendChild(toggleLabel);
  row.appendChild(labelEl);
  row.appendChild(badge);
  row.appendChild(actionsEl);

  toggleInput.addEventListener("change", async () => {
    const isEnabled = toggleInput.checked;
    labelEl.classList.toggle("disabled", !isEnabled);
    const data = isDefault
      ? { ...(override || {}), enabled: isEnabled }
      : { title, prompt, examples, enabled: isEnabled };
    if (isDefault && isEnabled) delete data.enabled;   // valeur par défaut → on n'écrit pas la clé
    const ok = await persistItem(item, data, () => renderQuickActionOptions(currentItems()));
    if (!ok) toggleInput.checked = !isEnabled;
  });

  // ── Panneau d'édition ──
  const editPanel = el("div", "edit-panel");
  const inner = el("div", "edit-panel-inner");

  const titleLabel = el("label", null, "Titre de l'action");
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = title;
  titleInput.placeholder = "Ex: ✏️ Mon action";

  const twoCol = el("div", "edit-two-col");
  const leftCol = el("div", "edit-col");
  const rightCol = el("div", "edit-col");

  leftCol.appendChild(el("label", null, "Prompt système"));
  leftCol.appendChild(el("p", "api-help", "Instruction de rôle envoyée à l'IA. Sois précis et liste les interdictions."));
  const promptTextarea = document.createElement("textarea");
  promptTextarea.value = prompt;
  promptTextarea.rows = 14;
  promptTextarea.placeholder = "Tu es un assistant qui ...";
  leftCol.appendChild(promptTextarea);

  rightCol.appendChild(el("label", null, "Exemples (few-shot)"));
  const examplesHelp = el("p", "api-help");
  examplesHelp.innerHTML = "Montrez à l'IA 2 à 4 paires <strong>entrée → sortie attendue</strong>. Cela force le modèle à imiter EXACTEMENT votre format de sortie. Très efficace avec Mistral / GPT-OSS.";
  rightCol.appendChild(examplesHelp);

  const examplesList = el("div", "examples-list");
  const localExamples = (examples || []).map(e => ({ input: e.input || "", output: e.output || "" }));

  function renderExamples() {
    examplesList.innerHTML = "";
    if (localExamples.length === 0) {
      const empty = el("p", "api-help", "Aucun exemple pour le moment.");
      empty.style.fontStyle = "italic";
      examplesList.appendChild(empty);
    }
    localExamples.forEach((ex, idx) => {
      const card = el("div", "example-card");
      const cardHeader = el("div", "example-card-header");
      cardHeader.appendChild(el("strong", null, `Exemple ${idx + 1}`));
      const removeBtn = iconButton("🗑️", "Supprimer cet exemple", "danger");
      removeBtn.addEventListener("click", () => { localExamples.splice(idx, 1); renderExamples(); });
      cardHeader.appendChild(removeBtn);

      const inputArea = document.createElement("textarea");
      inputArea.value = ex.input;
      inputArea.rows = 2;
      inputArea.placeholder = "Texte d'exemple en entrée";
      inputArea.addEventListener("input", () => { localExamples[idx].input = inputArea.value; });

      const outputArea = document.createElement("textarea");
      outputArea.value = ex.output;
      outputArea.rows = 3;
      outputArea.placeholder = "Sortie idéale attendue pour cette entrée";
      outputArea.addEventListener("input", () => { localExamples[idx].output = outputArea.value; });

      card.appendChild(cardHeader);
      card.appendChild(el("label", null, "Entrée"));
      card.appendChild(inputArea);
      card.appendChild(el("label", null, "Sortie attendue"));
      card.appendChild(outputArea);
      examplesList.appendChild(card);
    });
  }
  renderExamples();

  const addExampleBtn = el("button", "btn-sm btn-sm-ghost", "➕ Ajouter un exemple");
  addExampleBtn.type = "button";
  addExampleBtn.style.marginTop = "8px";
  addExampleBtn.addEventListener("click", () => { localExamples.push({ input: "", output: "" }); renderExamples(); });

  rightCol.appendChild(examplesList);
  rightCol.appendChild(addExampleBtn);
  twoCol.appendChild(leftCol);
  twoCol.appendChild(rightCol);

  const closePanel = () => { editPanel.classList.remove("open"); editBtn.textContent = "✏️"; };

  const panelActions = el("div", "edit-panel-actions");
  const cancelBtn2 = el("button", "btn-sm btn-sm-ghost", "Annuler");
  cancelBtn2.type = "button";
  cancelBtn2.addEventListener("click", closePanel);

  const saveBtn2 = el("button", "btn-sm btn-sm-primary", "Sauvegarder");
  saveBtn2.type = "button";
  saveBtn2.addEventListener("click", async () => {
    const newTitle = titleInput.value.trim();
    const newPrompt = promptTextarea.value.trim();
    if (!newTitle || !newPrompt) { alert("Le titre et le prompt sont obligatoires."); return; }
    const cleanedExamples = localExamples
      .map(e => ({ input: (e.input || "").trim(), output: (e.output || "").trim() }))
      .filter(e => e.input && e.output);

    const data = isDefault
      ? { ...(override || {}), title: newTitle, prompt: newPrompt, examples: cleanedExamples }
      : { title: newTitle, prompt: newPrompt, examples: cleanedExamples, enabled };
    await persistItem(item, data, () => { closePanel(); renderMenuItems(); showToast("Action enregistrée"); });
  });

  panelActions.appendChild(cancelBtn2);
  panelActions.appendChild(saveBtn2);

  inner.appendChild(titleLabel);
  inner.appendChild(titleInput);
  inner.appendChild(twoCol);
  inner.appendChild(panelActions);
  editPanel.appendChild(inner);

  editBtn.addEventListener("click", () => {
    const isOpen = editPanel.classList.contains("open");
    document.querySelectorAll(".edit-panel.open").forEach(p => p.classList.remove("open"));
    document.querySelectorAll(".icon-btn").forEach(b => { if (b.textContent === "✖️") b.textContent = "✏️"; });
    if (!isOpen) { editPanel.classList.add("open"); editBtn.textContent = "✖️"; }
  });

  wrapper.appendChild(row);
  wrapper.appendChild(editPanel);
  return wrapper;
}

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

confirmAddBtn.addEventListener("click", async () => {
  const title = newTitleInput.value.trim();
  const prompt = newPromptInput.value.trim();
  if (!title || !prompt) { alert("Le titre et le prompt sont obligatoires."); return; }
  const item = { id: "custom_" + Date.now(), isDefault: false };
  await persistItem(item, { title, prompt, examples: [], enabled: true }, () => {
    renderMenuItems();
    cancelAddBtn.click();
    showToast("Action ajoutée");
  });
});

// ===========================================================================
// 9. Export / import des réglages (sans secret)
// ===========================================================================
const backupResult = $("backup-result");

$("export-btn").addEventListener("click", async () => {
  const settings = await loadSettings();
  const payload = {
    dachi: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    settings: exportableSettings(settings),
    menu: { overrides: menuConfig.overrides, custom: menuConfig.custom }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dachi-reglages-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  backupResult.textContent = "✅ Export téléchargé (sans clés API)";
  backupResult.className = "test-result success";
});

$("import-btn").addEventListener("click", () => $("import-file").click());

$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  backupResult.className = "test-result";
  backupResult.textContent = "";

  try {
    const payload = JSON.parse(await file.text());
    if (!payload || typeof payload !== "object" || !payload.settings) throw new Error("fichier non reconnu");

    // Préférences : uniquement les clés connues, du bon type, jamais les secrets
    const PROVIDERS = ["scaleway", "local", "openai", "openrouter"];
    const incoming = {};
    for (const [k, v] of Object.entries(payload.settings)) {
      if (!(k in DEFAULT_SETTINGS) || SECRET_KEYS.includes(k) || k === "cguAccepted" || k === "cguAcceptedAt") continue;
      if (typeof v !== typeof DEFAULT_SETTINGS[k]) continue;
      if (k === "provider" && !PROVIDERS.includes(v)) continue;
      if (k === "localServerUrl") {
        let u; try { u = new URL(v); } catch (_) { continue; }
        if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      }
      if (typeof v === "string" && v.length > 20000) continue;
      incoming[k] = v;
    }

    // Un fichier de réglages peut rediriger les textes vers un autre serveur :
    // on le dit explicitement avant d'appliquer.
    const routing = [];
    if (incoming.provider) routing.push(`fournisseur : ${incoming.provider}`);
    if (incoming.localServerUrl) routing.push(`serveur local : ${incoming.localServerUrl}`);
    if (routing.length && !confirm(`Ce fichier modifie la destination des textes envoyés à l'IA (${routing.join(" ; ")}).\n\nN'importez que des fichiers que vous avez créés vous-même. Continuer ?`)) {
      throw new Error("import annulé");
    }
    await saveSettings(incoming);

    // Actions du menu
    let imported = 0, failed = 0;
    const menu = payload.menu || {};
    for (const [id, ov] of Object.entries(menu.overrides || {})) {
      if (!MENU_ITEMS.some(m => m.id === id) || !ov || typeof ov !== "object") continue;
      try { await saveMenuItem(id, ov); imported++; } catch (_) { failed++; }
    }
    for (const c of menu.custom || []) {
      if (!c || !c.id || !c.title || !c.prompt) continue;
      try {
        await saveMenuItem(c.id, { custom: true, title: c.title, prompt: c.prompt, examples: c.examples || [], enabled: c.enabled !== false });
        imported++;
      } catch (_) { failed++; }
    }

    const settings = await loadSettings();
    fillForm(settings);
    await loadMenuItems();
    chrome.runtime.sendMessage({ action: "rebuildMenus" }).catch(() => {});

    backupResult.textContent = `✅ Réglages importés (${imported} action${imported > 1 ? "s" : ""}${failed ? `, ${failed} ignorée${failed > 1 ? "s" : ""} : trop volumineuse${failed > 1 ? "s" : ""}` : ""}). Les clés API sont à ressaisir.`;
    backupResult.className = "test-result success";
  } catch (err) {
    backupResult.textContent = "❌ Import impossible : " + err.message;
    backupResult.className = "test-result error";
  }
});

// ===========================================================================
// 10. Navigation latérale — scroll-spy
// ===========================================================================
{
  const navLinks = Array.from(document.querySelectorAll("#sidenav a[href^='#']"));
  const sections = navLinks.map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  if (navLinks.length && "IntersectionObserver" in window) {
    const setActive = (id) => navLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === `#${id}`));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActive(visible[0].target.id);
    }, { rootMargin: "-80px 0px -60% 0px", threshold: 0 });
    sections.forEach(s => observer.observe(s));
  }
}

// ===========================================================================
// 11. Initialisation
// ===========================================================================
(async () => {
  const settings = await loadSettings();
  if (settings.cguAccepted !== CGU_VERSION) cguOverlay.classList.remove("hidden");
  await loadMenuItems();          // remplit aussi le sélecteur d'action rapide
  fillForm(settings);
  await restoreModelCaches();
})();
