# Dr Picklist - Extension VS Code pour Salesforce

<p align="center">
	<img src="media/icon.png" alt="Dr Picklist" width="128" height="128" />
</p>

Gérez facilement vos picklists Salesforce directement depuis VS Code. Exportez, importez et générez les métadonnées XML sans quitter votre éditeur.

---

## 📦 Installation Utilisateur

### Via VS Code Marketplace

L'extension est disponible sur le **VS Code Marketplace** :
- Ouvrez VS Code
- Allez dans **Extensions** (Ctrl+Shift+X)
- Recherchez **"Dr Picklist"**
- Cliquez sur **Install**

**Lien direct** : [Dr Picklist on VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=DrPicklist.dr-picklist)

### Via fichier VSIX (mode offline)

Téléchargez le dernier VSIX depuis les [Releases GitHub](https://github.com/jeanbaptistechamant-stack/DoctorPicklist/releases) et installez-le :
1. **Extensions** → **Install from VSIX…**
2. Sélectionnez le fichier `dr-picklist-*.vsix`

---

## 🎯 Utilisation - Commandes Disponibles

Une fois l'extension installée, tapez `Ctrl+Shift+P` et cherchez **"Dr Picklist"** pour accéder à :

### 1️⃣ **Export Values**
Exporte une picklist depuis Salesforce vers un fichier CSV.
- **Format d'entrée** : `Object.Field` (ex: `Account.Industry`)
- **Sortie** : CSV à `DrPicklist/csv/picklists/Object.Field.csv`

### 2️⃣ **Import Values**
Importe des valeurs depuis un CSV et génère le XML correspondant.
- **Modes** : 
  - Local Value Set (valeurs sur le champ)
  - Global Value Set (réutilisable sur plusieurs champs)
  - Standard Value Set (pour champs standard)
- **Sortie** : XML dans `force-app/main/default/objects/`

### 3️⃣ **Export Dependencies**
Exporte les dépendances de picklists (champ parent → enfant).
- **Sortie** : CSV structuré à `DrPicklist/csv/dependencies/`

### 4️⃣ **Import Dependencies**
Importe un CSV de dépendances et génère le XML du champ dépendant.
- **Sortie** : XML du champ dépendant dans `force-app/main/default/`

### 5️⃣ **Generate Metadata**
Génère automatiquement tous les fichiers XML à partir des CSVs.
- Exécution **automatique au démarrage** (configurable)
- Traite tous les CSVs des dossiers `picklists/` et `dependencies/`

### 6️⃣ **Prepare Deployment Package**
Prépare un package MDAPI prêt à déployer.
- **Sortie** : Dossier `DrPicklist/deploy/` avec structure MDAPI
- Utilisable avec `sfdx force:mdapi:deploy`

---

## ⚙️ Configuration

Dans **VS Code Settings** (`Ctrl+,`), recherchez `Dr Picklist` :

```json
{
  "drPicklist.autoGenerateOnStartup": true  // Génération auto à chaque ouverture du workspace
}
```

---

## 📋 Prérequis Utilisateur

- **VS Code** ≥ 1.85.0
- **Salesforce CLI** (sfdx) installé : `sfdx --version`
- Un **org Salesforce authentifié** : `sfdx force:org:list`
- Structure de projet SFDX standard

---

---

# 🛠️ Guide du Contributeur

Bienvenue ! Cette section explique comment configurer l'environnement de développement et améliorer l'extension.

## 📁 Structure du Projet

```
extensions/salesforce-picklist-admin/
├── src/
│   ├── sfdx.ts              # Utilitaires SFDX centralisés (run + parse robuste)
│   ├── extension.ts         # Point d'entrée VS Code (enregistrement commandes)
│   ├── cli_core.ts          # Logique métier (CSV/XML generation)
│   ├── cli.ts               # CLI autonome (dr-picklist command)
│   ├── salesforce.ts        # Exports/imports depuis Salesforce
│   ├── dependencies.ts      # Gestion dépendances picklistiques
│   ├── csv.ts               # Lecture/écriture CSV
│   ├── metadata.ts          # Construction XML métadonnées
│   ├── deploy.ts            # Préparation package MDAPI
│   └── __tests__/
│       ├── sfdx.test.ts     # Tests parseur JSON (filtrage bruit SFDX)
│       ├── csv.test.ts      # Tests CSV
│       ├── metadata.test.ts # Tests génération XML
│       └── salesforce.test.ts
├── out/                     # Fichiers compilés (générés, ignorés par git)
├── package.json             # Manifeste extension + dépendances npm
├── tsconfig.json            # Configuration TypeScript
├── jest.config.js           # Configuration Jest (tests)
├── .vscodeignore            # Fichiers exclus du VSIX
├── README.md                # Ce fichier
└── dr-picklist-*.vsix       # Package compilé (ignoré par git)

force-app/main/default/      # Métadonnées Salesforce (cible des imports)
DrPicklist/
├── csv/
│   ├── picklists/          # CSVs d'import/export picklists
│   └── dependencies/       # CSVs de dépendances
└── deploy/                 # Package MDAPI généré
```

## 🚀 Démarrage Développeur

### 1. Cloner et installer

```bash
git clone https://github.com/jeanbaptistechamant-stack/DoctorPicklist.git
cd DoctorPicklist/extensions/salesforce-picklist-admin
npm install
```

### 2. Compiler le TypeScript

```bash
npm run compile
```

Ou en mode **watch** (recompile à chaque sauvegarde) :

```bash
npm run watch
```

### 3. Tester en mode développement

Appuyez sur **F5** pour ouvrir une fenêtre VS Code **Development Host** avec l'extension chargée.

Dedans :
1. Tapez `Ctrl+Shift+P`
2. Cherchez **"Dr Picklist"**
3. Testez une commande (ex: Export Values)

**💡 Astuce** : À chaque modification TypeScript :
- Recompiler : `npm run compile` (ou Ctrl+Shift+B si watch est actif)
- Recharger extension : `Ctrl+Shift+P` → **Developer: Reload Window**

### 4. Exécuter les tests

```bash
npm test
```

Ou en mode watch :

```bash
npm run test:watch
```

**✅ Tests critiques** : `sfdx.test.ts` valide le parseur JSON avec bruit SFDX.

---

## 🔑 Architecture Clés

### Module SFDX Centralisé (`src/sfdx.ts`)

```typescript
export function runSfdx(command: string): Promise<string>
// Lance une commande SFDX, retourne stdout + stderr bruts

export function parseSfdxJson(output: string): any
// Parse JSON SFDX même si pollué par warnings/progress
// - Filtre les lignes de bruit (warning:, info:, npm warn, etc.)
// - Extrait le bloc JSON équilibré le plus grand
// - Robuste contre les sorties SFDX inconsistentes
```

**Avantage** : Code centralisé, tests faciles, parsing fiable.

### Extension VS Code (`src/extension.ts`)

Enregistre 6 commandes via `vscode.commands.registerCommand()` :

```typescript
drPicklist.exportValues        // Exporter picklist → CSV
drPicklist.importValues        // Importer CSV → XML
drPicklist.exportDependencies  // Exporter dépendances → CSV
drPicklist.importDependencies  // Importer CSV dépendances → XML
drPicklist.generateMetadata    // Batch: tous les CSVs → XMLs
drPicklist.prepareDeployment   // Préparer package MDAPI
```

Chaque commande gère l'UI (input boxes, quick picks) et appelle la logique métier.

### Logique Métier (`src/cli_core.ts`)

Fonctions réutilisables (appelées par extension ET CLI) :
- `readPicklistCsv(path)` / `writePicklistCsv(path, entries)`
- `buildPicklistFieldXml()` / `buildGlobalValueSetXml()`
- `buildDependentPicklistXml()`

---

## 🧪 Tester Localement

### Cas 1 : Test Export Values

```bash
# F5 → Development Host
# Ctrl+Shift+P → "Dr Picklist: Export Values"
# Entrée : "Account.Industry"
# ✓ Génère : DrPicklist/csv/picklists/Account.Industry.csv
```

### Cas 2 : Test Import Values

```bash
# Préparer CSV : DrPicklist/csv/picklists/Account.MyField__c.csv
Label,APIName,IsActive
Value1,Value1,true
Value2,Value2,true

# F5 → Ctrl+Shift+P → "Dr Picklist: Import Values"
# Sélectionner CSV → Mode "Local" → OK
# ✓ Génère : force-app/main/default/objects/Account/fields/MyField__c.field-meta.xml
```

### Cas 3 : Test Compilation

```bash
npm run compile
# ✓ Pas d'erreur TypeScript
# ✓ Fichiers générés dans out/
```

### Cas 4 : Test Tests

```bash
npm test
# PASS  src/__tests__/sfdx.test.ts (ignore warnings in JSON)
# PASS  src/__tests__/csv.test.ts
# PASS  src/__tests__/metadata.test.ts
# PASS  src/__tests__/salesforce.test.ts
# ✓ Test Suites: 4 passed, 4 total
# ✓ Tests: 9 passed, 9 total
```

---

## 🐛 Debugging

### Avec VS Code Debugger

1. Appuyez **F5** (ouvre Development Host avec breakpoints)
2. Ajoutez `console.log()` dans `src/`
3. Recompiler (`npm run compile`)
4. Recharger (`Developer: Reload Window`)
5. Voir les logs dans la console de la fenêtre dev

### Logs SFDX brutes

Pour diagnostiquer les problèmes de parsing, ajoutez temporairement :

```typescript
console.log('Raw SFDX output:', output);
const parsed = parseSfdxJson(output);
```

---

## 📝 Lignes Directrices Contribution

1. **Fork** le repo et créez une branche (`git checkout -b feat/my-feature`)
2. **Compilez** sans erreurs : `npm run compile`
3. **Testez** : `npm test` (tous les tests passent)
4. **Committez** clairement :
   - `feat: add xyz` pour nouvelles fonctionnalités
   - `fix: resolve #123` pour correctifs
5. **Poussez** et ouvrez une **Pull Request** vers `main`
6. Attendez l'approbation et le merge

### Avant chaque commit

```bash
npm run compile     # ✓ Pas d'erreurs TypeScript
npm test            # ✓ Tous les tests passent
git add -A
git commit -m "feat: description de la change"
git push origin feat/my-feature
```

---

## 📦 Packaging et Release

### Compiler le VSIX

```bash
npm run package
# Génère dr-picklist-X.X.X.vsix (~2.4 MB)
```

### Publier sur Marketplace (mainteneurs)

```bash
# 1. Bump version dans package.json
# 2. Compiler
npm run compile

# 3. Publier (nécessite VS Code PAT)
npm run publish
```

---

## 🔗 Ressources Utiles

- **[VS Code Extension API](https://code.visualstudio.com/api)** : Documentation officielle
- **[SFDX CLI Reference](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/)** : Commandes Salesforce
- **[TypeScript Handbook](https://www.typescriptlang.org/docs/)** : Langage principal
- **[Jest Testing](https://jestjs.io/)** : Tests unitaires

---

## 📄 Licence

MIT - Voir [LICENSE.md](LICENSE.md)

---

## 👥 Support & Feedback

Ouvrez une [GitHub Issue](https://github.com/jeanbaptistechamant-stack/DoctorPicklist/issues) pour :
- 🐛 Rapporter un bug
- 💡 Proposer une amélioration
- ❓ Poser une question

**Merci de contribuer !** 🙌
