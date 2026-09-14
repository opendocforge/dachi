import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Stub minimal de chrome.storage (sync + local), avec quota par clé comme Chrome.
function makeArea(quotaPerItem = Infinity) {
  const data = {};
  return {
    data,
    async get(keys) {
      if (keys === null || keys === undefined) return { ...data };
      if (typeof keys === "string") return keys in data ? { [keys]: data[keys] } : {};
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter(k => k in data).map(k => [k, data[k]]));
      const out = {};
      for (const [k, def] of Object.entries(keys)) out[k] = k in data ? data[k] : def;
      return out;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (k.length + JSON.stringify(v).length > quotaPerItem) throw new Error("QUOTA_BYTES_PER_ITEM quota exceeded");
      }
      Object.assign(data, JSON.parse(JSON.stringify(obj)));
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
    }
  };
}

beforeEach(() => {
  globalThis.chrome = { storage: { sync: makeArea(8192), local: makeArea() } };
});

const { loadMenuConfig, saveMenuItem, removeMenuItem, resolveMenuItems, MAX_ITEM_BYTES } = await import("../lib/menu-store.js");
const { loadSettings, saveSettings, exportableSettings, DEFAULT_SETTINGS } = await import("../lib/settings.js");
const { MENU_ITEMS } = await import("../lib/menu-defaults.js");

test("menu-store : migration de l'ancien format menuOverrides / customMenuItems", async () => {
  chrome.storage.sync.data.menuOverrides = { resumer: { enabled: false }, repondre: { prompt: "P" } };
  chrome.storage.sync.data.customMenuItems = [{ id: "custom_1", title: "Mon action", prompt: "X", enabled: true }];

  const cfg = await loadMenuConfig();
  assert.deepEqual(cfg.overrides.resumer, { enabled: false });
  assert.equal(cfg.custom.length, 1);
  assert.equal(cfg.custom[0].title, "Mon action");
  // ancien format supprimé, nouveau format écrit
  assert.ok(!("menuOverrides" in chrome.storage.sync.data));
  assert.ok(!("customMenuItems" in chrome.storage.sync.data));
  assert.deepEqual(chrome.storage.sync.data.menu_resumer, { enabled: false });
  assert.equal(chrome.storage.sync.data.menu_custom_1.custom, true);
});

test("menu-store : une clé par action, quota contrôlé avant écriture", async () => {
  await saveMenuItem("resumer", { title: "T" });
  assert.deepEqual(chrome.storage.sync.data.menu_resumer, { title: "T" });

  const big = { prompt: "x".repeat(MAX_ITEM_BYTES) };
  await assert.rejects(saveMenuItem("resumer", big), (err) => err.message === "QUOTA" && err.size > MAX_ITEM_BYTES);
  assert.deepEqual(chrome.storage.sync.data.menu_resumer, { title: "T" }, "l'ancienne valeur est conservée");

  await removeMenuItem("resumer");
  assert.ok(!("menu_resumer" in chrome.storage.sync.data));
});

test("menu-store : resolveMenuItems applique overrides et actions perso", async () => {
  await saveMenuItem("resumer", { enabled: false, title: "Synthèse" });
  await saveMenuItem("custom_9", { custom: true, title: "Perso", prompt: "P", examples: [] });
  const items = resolveMenuItems(MENU_ITEMS, await loadMenuConfig());
  const resumer = items.find(i => i.id === "resumer");
  assert.equal(resumer.enabled, false);
  assert.equal(resumer.title, "Synthèse");
  assert.equal(resumer.prompt, MENU_ITEMS.find(m => m.id === "resumer").prompt, "prompt par défaut conservé");
  const perso = items.find(i => i.id === "custom_9");
  assert.equal(perso.isDefault, false);
  assert.equal(perso.enabled, true);
});

test("settings : les secrets vont dans local, les préférences dans sync, défauts appliqués", async () => {
  await saveSettings({ provider: "local", scalewayApiKey: "SECRET", temperature: 0.7 });
  assert.equal(chrome.storage.sync.data.provider, "local");
  assert.ok(!("scalewayApiKey" in chrome.storage.sync.data));
  assert.equal(chrome.storage.local.data.scalewayApiKey, "SECRET");

  const s = await loadSettings();
  assert.equal(s.provider, "local");
  assert.equal(s.scalewayApiKey, "SECRET");
  assert.equal(s.temperature, 0.7);
  assert.equal(s.scalewayModel, DEFAULT_SETTINGS.scalewayModel, "défaut unique partagé avec le SW");
});

test("settings : migration des clés API historiquement dans sync", async () => {
  chrome.storage.sync.data.apiKey = "sk-old";
  const s = await loadSettings();
  assert.equal(s.apiKey, "sk-old");
  assert.ok(!("apiKey" in chrome.storage.sync.data), "retirée de sync");
  assert.equal(chrome.storage.local.data.apiKey, "sk-old");
});

test("settings : l'export ne contient jamais de secret ni l'acceptation des CGU", async () => {
  const s = await loadSettings();
  const out = exportableSettings({ ...s, apiKey: "sk", localApiKey: "k", scalewayApiKey: "s", cguAccepted: "1.0" });
  for (const k of ["apiKey", "localApiKey", "scalewayApiKey", "cguAccepted", "cguAcceptedAt"]) assert.ok(!(k in out), k);
  assert.ok("provider" in out);
});

test("settings : la clé OpenRouter est un secret (local) avec un modèle par défaut", async () => {
  await saveSettings({ provider: "openrouter", openrouterApiKey: "sk-or-v1-abc" });
  assert.ok(!("openrouterApiKey" in chrome.storage.sync.data));
  assert.equal(chrome.storage.local.data.openrouterApiKey, "sk-or-v1-abc");
  const s = await loadSettings();
  assert.equal(s.provider, "openrouter");
  assert.equal(s.openrouterApiKey, "sk-or-v1-abc");
  assert.match(s.openrouterModel, /^[a-z0-9-]+\/.+/, "identifiant fournisseur/modèle");
});

test("settings : l'ID de projet Scaleway reste sur le poste (local) et hors export", async () => {
  await saveSettings({ scalewayProjectId: "be10ccee-0000-0000-0000-000000000000" });
  assert.ok(!("scalewayProjectId" in chrome.storage.sync.data));
  assert.equal(chrome.storage.local.data.scalewayProjectId, "be10ccee-0000-0000-0000-000000000000");
  const s = await loadSettings();
  assert.ok(!("scalewayProjectId" in exportableSettings(s)));
});

test("menu-store : les questions (form) héritent du défaut, peuvent être remplacées ou retirées", async () => {
  const guide = MENU_ITEMS.find(m => m.id === "courrier_adressage_guide");
  assert.ok(guide && guide.form && guide.form.fields.length >= 3, "action par défaut avec questions");

  let items = resolveMenuItems(MENU_ITEMS, await loadMenuConfig());
  assert.equal(items.find(i => i.id === "courrier_adressage_guide").form, guide.form, "héritage");
  assert.equal(items.find(i => i.id === "resumer").form, null);

  await saveMenuItem("courrier_adressage_guide", { form: null });
  items = resolveMenuItems(MENU_ITEMS, await loadMenuConfig());
  assert.equal(items.find(i => i.id === "courrier_adressage_guide").form, null, "retiré par l'utilisateur");

  const custom = { fields: [{ key: "motif_1", label: "Motif", type: "textarea", required: true }] };
  await saveMenuItem("resumer", { form: custom });
  await saveMenuItem("custom_7", { custom: true, title: "Perso", prompt: "P", form: custom });
  items = resolveMenuItems(MENU_ITEMS, await loadMenuConfig());
  assert.deepEqual(items.find(i => i.id === "resumer").form, custom, "ajouté à une action par défaut");
  assert.deepEqual(items.find(i => i.id === "custom_7").form, custom, "action perso");
});

test("courrier d'adressage guidé : seul le motif est obligatoire, le destinataire est facultatif", () => {
  const guide = MENU_ITEMS.find(m => m.id === "courrier_adressage_guide");
  const required = guide.form.fields.filter(f => f.required).map(f => f.key);
  assert.deepEqual(required, ["motif"]);
  assert.match(guide.prompt, /\[NOM CONFRÈRE\]/, "le prompt sait quoi faire sans destinataire");
  assert.equal(MENU_ITEMS.filter(m => m.id === "courrier_adressage_guide").length, 1, "pas de doublon");
});

test("menu-store : ordre personnalisé des actions (menuOrder), inconnus à la fin, [] = défaut", async () => {
  const { saveMenuOrder, applyMenuOrder, isMenuKey } = await import("../lib/menu-store.js");
  assert.ok(isMenuKey("menuOrder"), "un changement d'ordre reconstruit le menu");

  await saveMenuItem("custom_z", { custom: true, title: "Z", prompt: "P" });
  await saveMenuOrder(["traduire_francais", "custom_z", "corriger_reformuler"]);
  let items = resolveMenuItems(MENU_ITEMS, await loadMenuConfig());
  assert.deepEqual(items.slice(0, 3).map(i => i.id), ["traduire_francais", "custom_z", "corriger_reformuler"]);
  assert.equal(items[3].id, "corriger_seul", "les autres suivent dans l'ordre naturel");
  assert.equal(items.length, MENU_ITEMS.length + 1);

  await saveMenuOrder([]);
  items = resolveMenuItems(MENU_ITEMS, await loadMenuConfig());
  assert.equal(items[0].id, "corriger_reformuler", "ordre par défaut restauré");
  assert.ok(!("menuOrder" in chrome.storage.sync.data));

  assert.deepEqual(applyMenuOrder([{ id: "a" }, { id: "b" }], ["b"]).map(i => i.id), ["b", "a"]);
});

test("courrier d'adressage guidé : exclusion des données obsolètes (cases à cocher) et règles de datation", () => {
  const guide = MENU_ITEMS.find(m => m.id === "courrier_adressage_guide");
  const exclure = guide.form.fields.find(f => f.key === "exclure");
  assert.equal(exclure.type, "checkboxes");
  assert.ok(exclure.options.some(o => /examen clinique/i.test(o)));
  assert.ok(guide.form.fields.some(f => f.key === "ignorer"), "champ libre « autres éléments à ignorer »");
  assert.match(guide.prompt, /Ne pas reprendre des données sources/);
  assert.match(guide.prompt, /jamais au présent/);
  assert.match(guide.examples[0].input, /Ne pas reprendre des données sources : Examen clinique/);
  assert.doesNotMatch(guide.examples[0].output, /auscultation|œdème|abdomen/i, "l'exemple n'a pas repris l'examen clinique exclu");
});
