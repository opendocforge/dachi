# 🩺 Dachi — Extension de productivité rédactionnelle pour médecins

Extension Chrome open-source d'aide à la **rédaction administrative** pour professionnels de santé. Interface accessible via le menu contextuel (clic droit) : sélectionnez du texte, appliquez une action de reformulation, traduction ou synthèse.

![Dachi Screenshot](icons/icon128.png)

---

## ⚠️ Avertissement important

**Dachi N'EST PAS un dispositif médical** au sens du règlement (UE) 2017/745 (MDR). C'est un **outil de productivité rédactionnelle**, au même titre qu'un correcteur orthographique ou un assistant de rédaction.

- ❌ Ne constitue **pas** une aide à la décision médicale
- ❌ Ne constitue **pas** une aide au diagnostic
- ❌ Ne constitue **pas** une aide à l'interprétation d'examens
- ❌ Ne constitue **pas** une aide à la prescription

**Tout contenu généré est un brouillon administratif devant être relu, corrigé et validé par le praticien.**

---

## Fonctionnalités

Actions disponibles via le clic droit sur du texte sélectionné :

| Action | Description |
|--------|-------------|
| ✏️ **Corriger & Reformuler** | Correction orthographique et reformulation stylistique |
| 💬 **Répondre** | Brouillon de réponse courtoise (emails, messages) |
| 📞 **Répondre Secrétariat** | Brouillon de réponse de secrétariat médical |
| 📋 **Résumer** | Synthèse rédactionnelle d'un texte long |
| ✉️ **Brouillon de courrier** | Brouillon de courrier d'adressage administratif |
| 📜 **Brouillon de certificat** | Brouillon de certificat (sans diagnostic) |
| 🌐 **Traduire en français** | Traduction avec conservation terminologique |

Chaque sortie est explicitement marquée comme **brouillon non validé**.

## Fournisseurs API supportés

| Fournisseur | Hébergement | Usage recommandé |
|-------------|-------------|------------------|
| **Scaleway AI** | 🛡️ Serveur HDS (France) | Par défaut — infrastructure certifiée HDS |
| **Serveur local** | 🔒 100% hors-ligne | Confidentialité maximale (Ollama, LM Studio...) |
| **OpenAI Direct** | ⚠️ Hors EEE (USA) | À éviter pour tout contenu de santé |

## Installation

1. Clonez le dépôt :
   ```bash
   git clone https://github.com/opendocforge/dachi.git
   ```
2. Ouvrez Chrome → `chrome://extensions/`
3. Activez le mode développeur
4. Cliquez "Charger l'extension non empaquetée" et sélectionnez le dossier
5. Acceptez les CGU puis configurez votre fournisseur API

## Configuration

### Scaleway AI (recommandé)

1. Créez une clé API sur [console.scaleway.com](https://console.scaleway.com/iam/api-keys)
2. Dans les options Dachi, sélectionnez Scaleway et collez votre clé
3. Choisissez le modèle (Qwen3.5 397B par défaut)

### Serveur local

1. Installez [Ollama](https://ollama.ai) ou [LM Studio](https://lmstudio.ai)
2. Lancez le serveur (ex: `ollama serve`)
3. Renseignez l'URL et le nom du modèle

## Cadre légal et responsabilité

### L'utilisateur est responsable

- Le médecin utilisateur est **seul responsable** de tout usage fait de l'extension et des contenus générés.
- Il est **responsable de traitement** au sens du RGPD.
- Il lui appartient de réaliser une **AIPD (art. 35 RGPD)** et de signer un **contrat de sous-traitance (art. 28)** avec le fournisseur d'API.
- Il s'engage à ne transmettre que des données **anonymisées ou pseudonymisées** (respect du secret médical — art. 226-13 du Code pénal).

### Ce que l'extension ne fait pas

- L'extension **ne stocke aucune donnée** de santé.
- L'extension **ne journalise rien**.
- L'extension **ne transmet aucune donnée** en dehors du fournisseur API configuré par l'utilisateur.
- Les clés API sont stockées localement via `chrome.storage.sync`.

### Aucune garantie

Logiciel fourni « en l'état » sous licence MIT. Aucune garantie de résultat, de disponibilité ou d'adéquation à un usage particulier. L'auteur décline toute responsabilité quant à l'usage qui en est fait.

## Sécurité technique

- Clés API confinées au Service Worker (jamais exposées au DOM)
- Communication chiffrée (HTTPS) avec les fournisseurs API
- Aucun analytics, tracking ou télémétrie
- Permissions Chrome minimales
- Code source intégralement auditable

## Architecture

```
dachi/
├── manifest.json       # Manifest V3
├── background.js       # Service Worker (menu contextuel + API)
├── content.js          # Modale de résultat
├── content.css         # Styles modale
├── options.html        # Page d'options + CGU
├── options.js          # Logique options + CGU
├── icons/              # Icônes extension
└── LICENSE             # MIT
```

## Licence

MIT. Voir [LICENSE](LICENSE).

---

*Dachi est un projet open-source indépendant. Non affilié à Scaleway, OpenAI, Microsoft ou à tout éditeur de logiciel médical.*
