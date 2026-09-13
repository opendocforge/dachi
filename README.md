# 🩺 Dachi — Extension de productivité rédactionnelle pour médecins

Extension Chrome open-source d'aide à la **rédaction administrative** pour professionnels de santé. Interface accessible via le menu contextuel (clic droit) : sélectionnez du texte, appliquez une action de reformulation, traduction ou synthèse.

<p align="center"><img src="icons/icon128.png" width="96" alt="Logo Dachi"></p>

<p align="center">
  <a href="https://github.com/opendocforge/dachi/releases/latest"><img alt="Dernière release" src="https://img.shields.io/github/v/release/opendocforge/dachi?label=release&color=6366F1"></a>
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white">
  <img alt="Licence" src="https://img.shields.io/badge/licence-Apache%202.0-blue">
  <img alt="Tests" src="https://img.shields.io/badge/tests-node%20--test-brightgreen">
  <img alt="Télémétrie" src="https://img.shields.io/badge/t%C3%A9l%C3%A9m%C3%A9trie-aucune-success">
</p>

<p align="center">
  <a href="https://github.com/opendocforge/dachi/releases/latest/download/dachi.zip"><img alt="Télécharger dachi.zip (dernière version)" src="https://img.shields.io/badge/%E2%AC%87%EF%B8%8F%20T%C3%A9l%C3%A9charger%20dachi.zip-derni%C3%A8re%20version-6366F1?style=for-the-badge"></a>
</p>

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
| 📨 **Courrier d'adressage guidé** | Sélectionnez un ancien courrier ou compte-rendu : Dachi demande d'abord le destinataire, la spécialité, le motif, l'urgence et les points à souligner, puis rédige un courrier d'adressage complet à partir des deux |
| 📜 **Brouillon de certificat** | Brouillon de certificat (sans diagnostic) |
| 🌐 **Traduire en français** | Traduction avec conservation terminologique |

Chaque sortie est explicitement marquée comme **brouillon non validé**.

Les actions se réordonnent dans la page d'options (glisser-déposer ou flèches) ; l'ordre est celui du menu du clic droit.

**Questions avant génération** : toute action — par défaut ou créée par vous — peut poser des questions au clic droit (destinataire, motif, urgence, liste de choix…) avant de générer. Les réponses sont jointes au texte sélectionné sous forme de consignes. L'éditeur de questions se trouve dans la page d'options, à la création d'une action ou en modifiant une action existante ; « Courrier d'adressage guidé » en est un exemple pré-rempli.

Dans la modale de résultat : réponse affichée **en streaming**, boutons **Régénérer**, **Affiner** (consigne supplémentaire appliquée à la réponse précédente), **Copier** et **Remplacer la sélection**. Le dernier résultat peut être rouvert depuis le menu Dachi. Un raccourci clavier (<kbd>Alt</kbd>+<kbd>Maj</kbd>+<kbd>D</kbd>, modifiable dans `chrome://extensions/shortcuts`) lance l'action rapide choisie dans les options.

## Anonymisation et ré-identification locales

Avant tout envoi, les données identifiantes sont remplacées localement par des placeholders numérotés (`[NOM 1]`, `[DATE 2]`, `[TEL 3]`…) : noms (titre + nom, « Prénom NOM », noms en capitales), NIR, IPP, téléphones, emails, dates en chiffres ou en lettres, adresses, code postal + ville. Les sigles médicaux courants sont préservés ; vous pouvez ajouter les vôtres dans les options.

La table de correspondance ne quitte jamais votre poste : elle sert à **ré-identifier la réponse** (les valeurs d'origine remplacent les placeholders dans le texte généré). Une option « Vérifier le texte anonymisé avant envoi » affiche un aperçu modifiable à chaque action.

## Fournisseurs API supportés

| Fournisseur | Hébergement | Usage recommandé |
|-------------|-------------|------------------|
| **Scaleway AI** | 🛡️ Serveur HDS (France) | Par défaut — infrastructure certifiée HDS |
| **Serveur local** | 🔒 100% hors-ligne | Confidentialité maximale (Ollama, LM Studio...) |
| **OpenAI Direct** | ⚠️ Hors EEE (USA) | À éviter pour tout contenu de santé |
| **OpenRouter** | ⚠️ Hors EEE (routage multi-fournisseurs) | Accès à des centaines de modèles avec une seule clé (`sk-or-…`) ; `data_collection: deny` demandé par défaut. À éviter pour tout contenu de santé |

## Installation

1. Téléchargez la dernière version prête à installer : **[dachi.zip (lien direct)](https://github.com/opendocforge/dachi/releases/latest/download/dachi.zip)** — ou choisissez une version sur la [page des releases](https://github.com/opendocforge/dachi/releases) — puis décompressez l'archive.
   *(Développeurs : `git clone https://github.com/opendocforge/dachi.git` fonctionne aussi.)*
2. Ouvrez Chrome → `chrome://extensions/`
3. Activez le **Mode développeur** (interrupteur en haut à droite)
4. Cliquez **Charger l'extension non empaquetée** et sélectionnez le dossier décompressé (celui qui contient `manifest.json`)
5. Acceptez les CGU puis configurez votre fournisseur API (bouton **Tester la connexion**)
6. Sélectionnez du texte sur n'importe quelle page → clic droit → **Dachi**

## Configuration

### Scaleway AI (recommandé)

1. Créez une clé API sur [console.scaleway.com](https://console.scaleway.com/iam/api-keys)
2. Dans les options Dachi, sélectionnez Scaleway et collez votre clé
3. Choisissez le modèle (`gemma-4-26b-a4b-it` par défaut : rapide et de bonne qualité, raisonnement interne désactivé automatiquement) — le bouton « Actualiser » charge la liste des modèles disponibles sur votre projet

### Serveur local

1. Installez [Ollama](https://ollama.ai) ou [LM Studio](https://lmstudio.ai)
2. Lancez le serveur (ex: `ollama serve`)
3. Renseignez l'URL et le nom du modèle

> **Longs textes avec Ollama** : la fenêtre de contexte par défaut est de 4 096 jetons ; au-delà, le début du prompt (les consignes) est tronqué silencieusement. Pour le courrier d'adressage guidé sur un ancien courrier complet, lancez Ollama avec une fenêtre plus large, par exemple `OLLAMA_CONTEXT_LENGTH=16384` (variable d'environnement, puis redémarrez Ollama). Sur un PC sans GPU, la lecture d'un long texte peut prendre plusieurs minutes avant le premier mot : Dachi attend jusqu'à 4 minutes 30.

#### Serveur distant sur réseau privé (LAN, Tailscale, VPN)

Le serveur peut tourner sur une autre machine que celle du cabinet, par exemple un PC à domicile joint via [Tailscale](https://tailscale.com) (chiffrement WireGuard de bout en bout, aucun tiers ne voit le contenu).

1. Côté serveur, exposez Ollama sur l'IP Tailscale (`OLLAMA_HOST=100.x.y.z:11434`, puis redémarrez Ollama) — ou utilisez `tailscale serve --bg 11434` pour obtenir une URL HTTPS `*.ts.net` sans toucher à Ollama ni au pare-feu.
2. Dans les options Dachi, renseignez l'URL (ex : `http://100.x.y.z:11434/v1`) et cliquez sur **Tester la connexion**.
3. Chrome demande une fois l'autorisation d'accéder à cette adresse (`optional_host_permissions`) : acceptez. Les permissions par défaut de l'extension restent limitées à `localhost`.

## Réduire la latence

Ce qui compte, dans l'ordre :

1. **Désactiver le raisonnement interne** (options → Modèle → « Raisonnement interne du modèle »). Gemma 4, Qwen 3.5/3.6, Mistral Medium 3.5, DeepSeek V4, GLM 5.2 et les GPT-5 « réfléchissent » avant d'écrire : des centaines de jetons invisibles qui rallongent l'attente sans rien apporter à la rédaction. « Automatique » (défaut) le désactive dès que le modèle l'accepte. La modale signale quand un modèle réfléchit (« Le modèle réfléchit avant de répondre… »).
2. **Choisir un modèle rapide** — sur Scaleway, les architectures MoE à peu de paramètres actifs (`gemma-4-26b-a4b-it`, `qwen3.5-35b-a3b`, `qwen3.6-35b-a3b`) écrivent nettement plus vite qu'un modèle dense de 24 B (`mistral-small-3.2`). La ligne ⏱ sous chaque résultat (premier mot, total, mots/s, raisonnement) permet de comparer.
3. **Alléger le prompt** — « Exemples envoyés par action » (options) réduit les exemples few-shot ; un contexte médecin court ; une sélection limitée aux passages utiles.
4. Le reste est pris en charge : réponse en streaming, réveil anticipé de l'extension au clic droit, démarrage parallélisé, connexion réutilisée.

Pour un serveur local, la vitesse dépend surtout du matériel (GPU) et de la taille du modèle ; avec Ollama, un modèle quantifié 4 bits de 7–14 B est le bon compromis.

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
- Les clés API sont stockées dans `chrome.storage.local` (jamais synchronisées via le compte Google) ; seules les préférences et les actions du menu passent par `chrome.storage.sync`.
- L'export des réglages (page d'options) ne contient jamais de clé API.

### Aucune garantie

Logiciel fourni « en l'état » sous licence Apache 2.0. Aucune garantie de résultat, de disponibilité ou d'adéquation à un usage particulier. L'auteur décline toute responsabilité quant à l'usage qui en est fait.

## Sécurité technique

- Clés API confinées au Service Worker (jamais exposées au DOM)
- Communication chiffrée (HTTPS) avec les fournisseurs API
- Aucun analytics, tracking ou télémétrie
- Permissions Chrome minimales ; accès à un serveur distant accordé origine par origine, à la demande (`optional_host_permissions`)
- Aucune ressource exposée aux sites web (`web_accessible_resources` vide : l'extension n'est pas détectable par les pages)
- Modale rendue dans un **Shadow DOM fermé** : les scripts de la page hôte ne peuvent ni lire le texte généré ni actionner les boutons (seuls les clics réels de l'utilisateur sont pris en compte)
- Le texte produit par le modèle est toujours traité comme du texte : il est échappé avant insertion dans la page (aucun HTML/script issu de l'IA n'est exécuté)
- Import de réglages validé (types, fournisseur, URL) avec confirmation explicite si la destination des textes change
- Code source intégralement auditable

## Architecture

```
dachi/
├── manifest.json         # Manifest V3 (Service Worker en mode module)
├── background.js         # Service Worker : menus, raccourci, pipeline anonymisation → API (streaming) → ré-identification
├── content.js            # Modale de résultat (aperçu, streaming, régénérer / affiner, insertion)
├── content.css           # Styles de la modale
├── options.html / .js    # Page d'options + CGU (module ES)
├── lib/
│   ├── anonymizer.js     # Pseudonymisation locale + ré-identification
│   ├── menu-defaults.js  # Actions par défaut (prompts + exemples few-shot), source unique
│   ├── menu-store.js     # Persistance des actions (une clé sync par action, migration)
│   ├── settings.js       # Réglages : défauts, secrets en storage.local, export
│   └── utils.js          # Helpers purs (permissions d'origine, erreurs, parseur SSE)
├── test/                 # Tests unitaires (node --test)
├── icons/                # Icônes extension
└── LICENSE               # Apache 2.0
```

## Développement

```bash
npm test
```

Les tests couvrent l'anonymiseur (aller-retour, acronymes, régressions), le parseur de flux, la migration du stockage et le routage des secrets. Aucune dépendance : Node ≥ 20 suffit.

**Publier une version** : incrémenter `version` dans `manifest.json` et `package.json`, créer la release GitHub `vX.Y.Z` en y joignant l'archive `dachi-X.Y.Z.zip` (fichiers de l'extension uniquement, dans un dossier `dachi-X.Y.Z/`) **et une copie nommée `dachi.zip`** — c'est elle que vise le lien stable `releases/latest/download/dachi.zip` du README.

## Licence

Apache License 2.0. Voir [LICENSE](LICENSE).

---

*Dachi est un projet open-source indépendant. Non affilié à Scaleway, OpenAI, Microsoft ou à tout éditeur de logiciel médical.*
