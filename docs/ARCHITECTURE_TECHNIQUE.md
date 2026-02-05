# Architecture Technique — Dr Picklist

Ce document explique les technologies et l'architecture du projet Dr Picklist.

## Vue d'ensemble

Dr Picklist est une **extension VS Code** qui facilite la gestion des métadonnées de picklists Salesforce via des fichiers CSV. Elle permet d'exporter, modifier et importer des listes de sélection (picklists) et leurs dépendances de manière simplifiée.

## Stack Technique

### 1. Extension VS Code

**TypeScript** est le langage principal du projet.

- **Version**: TypeScript 5.3.3
- **Target**: ES2020
- **Configuration**: Compilation stricte activée pour une meilleure qualité de code

L'extension utilise l'**API VS Code** (`@types/vscode` ^1.85.0) pour :
- Enregistrer des commandes dans la palette de commandes
- Gérer les interactions avec l'utilisateur (saisies, sélections)
- Accéder au workspace et au système de fichiers
- Afficher des notifications et des messages

### 2. Salesforce CLI (SFDX)

L'extension s'interface avec **Salesforce CLI** pour :
- Se connecter aux organisations Salesforce (`sfdx force:auth:web:login`)
- Récupérer les métadonnées des picklists via l'API Tooling
- Déployer les packages de métadonnées (`sfdx force:mdapi:deploy`)

**API Version Salesforce**: 
- Version du projet : 65.0 (configurée dans `sfdx-project.json`)
- Version par défaut du déploiement CLI : 59.0 (configurable via `--api` dans `dr-picklist prepare-deploy`)

### 3. Traitement des données

#### CSV
- **csv-parse** (^5.5.0) : Parser les fichiers CSV en objets JavaScript
- **csv-stringify** (^6.5.0) : Générer des CSV depuis des objets JavaScript

Format CSV utilisé pour les picklists (délimiteur : point-virgule) :
```csv
Label;APIName;IsActive
Manufacturing;Manufacturing;true
Technology;Technology;true
```

Format CSV pour les dépendances (délimiteur principal : virgule ; séparateur de valeurs multiples : point-virgule) :
```csv
ControllingField,DependentField,ControllingValue,DependentValues
Country__c,State__c,France,Île-de-France;Provence;Normandie
Country__c,State__c,USA,California;Texas;New York
```

#### XML
- **xmlbuilder2** (^3.1.1) : Construire et générer les fichiers de métadonnées Salesforce au format XML

Types de métadonnées générés :
- **Objects** (`.object`) : Définitions de champs avec `<valueSetDefinition>`
- **GlobalValueSets** (`.globalValueSet`) : Ensembles de valeurs globales
- **StandardValueSets** (`.standardValueSet`) : Ensembles de valeurs standard
- **package.xml** : Manifeste de déploiement MDAPI

### 4. Interface en ligne de commande (CLI)

L'extension peut également être utilisée en mode CLI grâce à **Commander** (^12.0.0).

Commandes disponibles :
- `dr-picklist generate` : Génération des métadonnées
- `dr-picklist prepare-deploy` : Préparation du package de déploiement
- `dr-picklist export-values` : Export d'une picklist
- `dr-picklist import-values` : Import d'une picklist
- `dr-picklist export-dependencies` : Export des dépendances de picklist
- `dr-picklist import-dependencies` : Import des dépendances de picklist

### 5. Tests

**Jest** (^29.7.0) est utilisé pour les tests unitaires.

- **ts-jest** (^29.1.1) : Permet de tester du code TypeScript
- **@types/jest** (^29.5.12) : Typage pour Jest

Configuration : `jest.config.js` et `tsconfig.jest.json`

Tests disponibles :
- Tests des modules CSV
- Tests des modules de métadonnées
- Mock de l'API VS Code pour les tests

### 6. Qualité du code (projet parent Salesforce)

Le projet parent utilise des outils pour maintenir la qualité du code :

- **ESLint** (^9.29.0) : Linting JavaScript pour les composants Lightning (LWC/Aura)
  - `@salesforce/eslint-config-lwc`
  - `@salesforce/eslint-plugin-aura`
  - `@salesforce/eslint-plugin-lightning`
  
- **Prettier** (^3.5.3) : Formatage automatique du code
  - `prettier-plugin-apex` : Support des fichiers Apex
  - `@prettier/plugin-xml` : Support des fichiers XML
  
- **Husky** (^9.1.7) : Git hooks pour automatiser les vérifications
- **lint-staged** (^16.1.2) : Exécution du linting uniquement sur les fichiers modifiés

- **sfdx-lwc-jest** (^7.0.2) : Tests pour les Lightning Web Components

## Architecture des modules

### Structure du code source

```
extensions/salesforce-picklist-admin/src/
├── extension.ts          # Point d'entrée de l'extension VS Code
├── cli.ts                # Point d'entrée CLI
├── cli_core.ts           # Logique CLI partagée
├── csv.ts                # Lecture/écriture CSV
├── metadata.ts           # Génération des métadonnées XML
├── dependencies.ts       # Gestion des dépendances de picklists
├── salesforce.ts         # Interface avec Salesforce API
├── sfdx.ts               # Interface avec Salesforce CLI
└── deploy.ts             # Préparation des packages de déploiement
```

### Flux de données

1. **Export** : Salesforce Org → API Tooling (SFDX) → CSV
2. **Modification** : CSV (édité manuellement)
3. **Import** : CSV → XML (métadonnées) → Package MDAPI → Salesforce Org

### Gestion de la configuration

L'extension offre des paramètres configurables :
- `drPicklist.autoGenerateOnStartup` : Génération automatique au démarrage (booléen, défaut : true)

Configuration dans `.vscode/settings.json` ou via l'interface VS Code.

## Modes de picklists supportés

### 1. Picklist Field (Local Value Set)
Valeurs stockées directement dans le champ.

**Fichier XML généré** : `DrPicklist/metadata/objects/<Object>.object`

### 2. GlobalValueSet
Ensemble de valeurs réutilisable entre plusieurs champs.

**Fichiers XML générés** :
- `DrPicklist/metadata/globalValueSets/<Name>.globalValueSet`
- Référence dans `DrPicklist/metadata/objects/<Object>.object`

### 3. StandardValueSet
Ensemble de valeurs standard Salesforce (ex: Industry, LeadSource).

**Fichier XML généré** : `DrPicklist/metadata/standardValueSets/<Name>.standardValueSet`

## Convention de nommage des fichiers CSV

- **Picklist locale** : `<Object>.<Field>.csv` (ex: `Account.Industry.csv`)
- **GlobalValueSet** : `<Name>_Global.csv` (ex: `Industry_Global.csv`)
- **StandardValueSet** : `<Name>_Standard.csv` (ex: `Industry_Standard.csv`)
- **Dépendances** : `<Object>.<ControllingField>__to__<DependentField>.csv`

## Déploiement

### Package MDAPI
Structure générée dans `DrPicklist/deploy/` :
```
DrPicklist/deploy/
├── package.xml
└── src/
    ├── objects/
    ├── globalValueSets/
    └── standardValueSets/
```

### Commande de déploiement
Depuis le répertoire `DrPicklist/deploy/` :
```powershell
sfdx force:mdapi:deploy -d src -w -1
```

## Environnement de développement

### Prérequis
- **Node.js** : Pour exécuter TypeScript et les dépendances npm
- **VS Code** : Version 1.85.0 ou supérieure
- **Salesforce CLI** : Pour l'authentification et le déploiement
- **Git** : Pour la gestion de version

### Compilation
```powershell
cd extensions/salesforce-picklist-admin
npm install
npm run compile
```

Sortie : Fichiers JavaScript dans `out/`

### Mode développement
Lancement de l'extension en mode développement :
```powershell
code <path-to-project> --extensionDevelopmentPath <path-to-extension>
```

### Publication
L'extension peut être packagée avec **@vscode/vsce** (^3.0.0) :
```powershell
npm run package  # Génère un fichier .vsix
npm run publish  # Publie sur VS Code Marketplace
```

## Résumé technique

| Composant | Technologie | Version | Usage |
|-----------|-------------|---------|-------|
| Langage | TypeScript | 5.3.3 | Code source principal |
| Runtime | Node.js | 20.x | Exécution de l'extension |
| Plateforme | VS Code Extension API | 1.85.0+ | Interface utilisateur |
| Salesforce | Salesforce CLI (SFDX) | Latest | API Tooling, déploiement |
| CSV | csv-parse, csv-stringify | 5.x, 6.x | Parsing/génération CSV |
| XML | xmlbuilder2 | 3.1.1 | Génération métadonnées |
| CLI | Commander | 12.0.0 | Interface ligne de commande |
| Tests | Jest, ts-jest | 29.x | Tests unitaires |
| Build | TypeScript Compiler | 5.3.3 | Transpilation TS → JS |

## Points clés d'architecture

1. **Séparation des responsabilités** : Chaque module a une fonction spécifique (CSV, XML, SFDX, etc.)
2. **Support multi-interface** : VS Code Extension + CLI
3. **Génération automatique** : Traitement en lot des CSV au démarrage (configurable)
4. **Métadonnées déclaratives** : Utilisation du format MDAPI pour une compatibilité maximale
5. **Workflow hybride** : Édition manuelle (CSV) + génération automatique (XML)

## Évolution et extensibilité

Le projet est structuré pour faciliter :
- L'ajout de nouveaux types de métadonnées Salesforce
- L'intégration de nouveaux formats (JSON, YAML)
- L'extension des fonctionnalités CLI
- L'ajout de nouveaux workflows de déploiement
