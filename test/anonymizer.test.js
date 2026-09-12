import { test } from "node:test";
import assert from "node:assert/strict";
import { anonymizeText, rehydrateText, parseAcronymList, MEDICAL_ACRONYMS } from "../lib/anonymizer.js";

test("les placeholders ne sont jamais re-capturés par la règle MAJUSCULES (régression [[NOM]])", () => {
  const r = anonymizeText("Mme DUPONT, née le 12/03/1960, tel 06 12 34 56 78, mail marie@ex.fr.");
  assert.doesNotMatch(r.text, /\[\[/);
  assert.match(r.text, /Mme \[NOM 1\], née le \[DATE 2\], tel \[TEL 3\], mail \[EMAIL 4\]\./);
});

test("numérotation dans l'ordre d'apparition et table de correspondance", () => {
  const r = anonymizeText("Dr Martin a vu Jean DURAND le 3 mars 2024.");
  assert.equal(r.text, "Dr [NOM 1] a vu [NOM 2] le [DATE 3].");
  assert.deepEqual(r.map, { "[NOM 1]": "Martin", "[NOM 2]": "Jean DURAND", "[DATE 3]": "3 mars 2024" });
  assert.equal(r.count, 3);
});

test("une même valeur reçoit toujours le même placeholder", () => {
  const r = anonymizeText("Mme DUPONT est venue. Mme DUPONT reviendra.");
  assert.equal(r.text, "Mme [NOM 1] est venue. Mme [NOM 1] reviendra.");
  assert.equal(r.replacements.nom, 1);
});

test("les acronymes médicaux et mots administratifs en capitales sont conservés", () => {
  const r = anonymizeText("ECG normal, ORL : RAS, NIR communiqué, CRP 12, RDV pris.");
  assert.equal(r.count, 0);
  assert.equal(r.text, "ECG normal, ORL : RAS, NIR communiqué, CRP 12, RDV pris.");
});

test("acronymes personnalisés", () => {
  const sans = anonymizeText("Adressé à la CPTS.");
  assert.equal(sans.text, "Adressé à la [NOM 1].");
  const avec = anonymizeText("Adressé à la CPTS.", { customAcronyms: parseAcronymList("cpts, MSP") });
  assert.equal(avec.text, "Adressé à la CPTS.");
});

test("NIR, IPP, adresse, code postal + ville, date de naissance en année", () => {
  const r = anonymizeText("NIR 2 60 03 75 123 456 78, IPP 12345678, habite 12 rue de la Paix, 69001 Lyon, née en 1960.");
  assert.equal(r.replacements.nir, 1);
  assert.equal(r.replacements.ipp, 1);
  assert.equal(r.replacements.adresse, 1);
  assert.equal(r.replacements.cp_ville, 1);
  assert.equal(r.replacements.date, 1);
  assert.match(r.text, /IPP \[IPP \d\]/);
  assert.match(r.text, /née en \[DATE \d\]/);
});

test("un titre de civilité suivi d'un nom en capitales n'est pas pris pour « Prénom NOM »", () => {
  const r = anonymizeText("Mme DUPONT Marie");
  assert.equal(r.text, "Mme [NOM 1]");
  assert.equal(r.map["[NOM 1]"], "DUPONT Marie");
});

test("rehydrateText restaure les valeurs, avec tolérance sur l'écriture des placeholders", () => {
  const r = anonymizeText("Courrier pour Mme DUPONT, née le 12/03/1960, 69001 Lyon.");
  const reply = "Chère [nom 1], née le [DATE_2], domiciliée à [ CP VILLE 3 ].";
  const back = rehydrateText(reply, r.map);
  assert.equal(back.text, "Chère DUPONT, née le 12/03/1960, domiciliée à 69001 Lyon.");
  assert.equal(back.restored, 3);
});

test("rehydrateText sans table ou sans placeholder est neutre", () => {
  assert.deepEqual(rehydrateText("Bonjour", {}), { text: "Bonjour", restored: 0 });
  assert.deepEqual(rehydrateText("", { "[NOM 1]": "X" }), { text: "", restored: 0 });
});

test("texte vide", () => {
  const r = anonymizeText("");
  assert.equal(r.text, "");
  assert.equal(r.count, 0);
  assert.deepEqual(r.map, {});
});

test("la liste d'acronymes intégrée contient les classiques", () => {
  for (const a of ["ECG", "IRM", "HTA", "BPCO", "ORL", "CPK", "RPPS", "HAS"]) assert.ok(MEDICAL_ACRONYMS.has(a), a);
});
