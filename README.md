# Dr Picklist — Administration des picklists Salesforce

Dr Picklist est une extension VS Code pour exporter, modifier et générer les métadonnées des listes de sélection (picklists) Salesforce via des fichiers CSV.

## Prérequis
- Salesforce CLI installé et connecté à une org
- VS Code avec le projet ouvert

Connexion CLI:

```powershell
sfdx force:auth:web:login
```

## Installation (Windows)
- Cloner le dépôt et ouvrir le dossier:

```powershell
git clone https://github.com/jeanbaptistechamant-stack/DoctorPicklist.git
cd DoctorPicklist
```

- Option pas-à-pas (compilation puis lancement):

```powershell
Push-Location "c:\Users\JeanBaptisteChamant\Desktop\DoctorPicklist\DoctorPicklist\extensions\salesforce-picklist-admin"
npm install
npm run compile
Pop-Location

code "c:\Users\JeanBaptisteChamant\Desktop\DoctorPicklist\DoctorPicklist" --extensionDevelopmentPath "c:\Users\JeanBaptisteChamant\Desktop\DoctorPicklist\DoctorPicklist\extensions\salesforce-picklist-admin"
```

- Option en une seule commande (exemple avec `TEST_PROJECT`):

```powershell
Push-Location "c:\Users\JeanBaptisteChamant\Desktop\TEST_PROJECT\TEST_PROJECT\DoctorPicklist\extensions\salesforce-picklist-admin"; npm install; npm run compile; Pop-Location; code "c:\Users\JeanBaptisteChamant\Desktop\TEST_PROJECT\TEST_PROJECT\DoctorPicklist" --extensionDevelopmentPath "c:\Users\JeanBaptisteChamant\Desktop\TEST_PROJECT\TEST_PROJECT\DoctorPicklist\extensions\salesforce-picklist-admin"
```


## Commandes (VS Code)
- Dr Picklist: Export Values (`drPicklist.exportValues`) — Exporter une picklist vers CSV
- Dr Picklist: Import Values (`drPicklist.importValues`) — Importer/ajouter des valeurs depuis CSV
	- Modes: Picklist Field (Local), GlobalValueSet, StandardValueSet
- Dr Picklist: Export Dependencies (`drPicklist.exportDependencies`) — Exporter les dépendances (champ de contrôle → champ dépendant)
- Dr Picklist: Import Dependencies (`drPicklist.importDependencies`) — Importer les dépendances depuis CSV
- Dr Picklist: Generate Metadata (`drPicklist.generateMetadata`) — Générer tous les fichiers XML depuis les CSV (local seulement)
- Dr Picklist: Prepare Deployment Package (`drPicklist.prepareDeployment`) — Préparer le package de déploiement (copie en `DrPicklist/deploy/src` + `package.xml`)

Important: ces commandes sont des commandes VS Code (palette de commandes), pas des commandes PowerShell. Ouvrez la palette avec `Ctrl+Shift+P`, puis tapez le nom de la commande (ex: “Dr Picklist: Export Values”).

## Dossiers
- DrPicklist/csv/picklists — Exports/imports de picklists
- DrPicklist/csv/dependencies — CSV des dépendances
- DrPicklist/metadata/objects — XML générés des objets/champs
- DrPicklist/metadata/globalValueSets — XML des GlobalValueSet
- DrPicklist/metadata/standardValueSets — XML des StandardValueSet
- project/deploy/src — Structure de déploiement MDAPI

## Fichiers de test fournis
- Picklist locale: [DrPicklist/csv/picklists/Account.Industry.csv](DrPicklist/csv/picklists/Account.Industry.csv)
- GlobalValueSet: [DrPicklist/csv/picklists/Industry_Global.csv](DrPicklist/csv/picklists/Industry_Global.csv)
- StandardValueSet: [DrPicklist/csv/picklists/Industry_Standard.csv](DrPicklist/csv/picklists/Industry_Standard.csv)
- Dépendances: [DrPicklist/csv/dependencies/Account.Country__c__to__State__c.csv](DrPicklist/csv/dependencies/Account.Country__c__to__State__c.csv)

Contenu exemple (CSV):

Picklist Values

```
Label,APIName,IsActive
Manufacturing,Manufacturing,true
Technology,Technology,true
Education,Education,true
```

Picklist Dependencies

```
ControllingField,DependentField,ControllingValue,DependentValues
Country__c,State__c,France,"Île-de-France;Provence;Normandie"
Country__c,State__c,USA,"California;Texas;New York"
```

## Utilisation rapide
1. Exporter une picklist via “Dr Picklist: Export Values” (ex: `Account.Industry`).
2. Modifier le CSV sous `DrPicklist/csv/picklists`.
3. Importer via “Dr Picklist: Import Values” et choisir le mode:
	 - Local: génère `DrPicklist/metadata/objects/<Object>.object` avec `<valueSetDefinition>`.
	 - GlobalValueSet: génère `DrPicklist/metadata/globalValueSets/<Name>.globalValueSet` et référence le champ.
	 - StandardValueSet: génère `DrPicklist/metadata/standardValueSets/<Name>.standardValueSet`.
4. Dépendances: exporter ou importer via les commandes dédiées pour produire l’XML avec `<controllingField>` et `<valueSettings>`.
5. Générer en lot: “Dr Picklist: Generate Metadata” (traite les CSV des picklists locales et dépendances).
6. Préparer le package: “Dr Picklist: Prepare Deployment Package”.

Déploiement (optionnel):
## Exemples — commandes terminal pour créer les métadonnées à partir des fichiers de test

Assurez-vous d’abord que l’extension est compilée:

```powershell
Push-Location "c:\Users\JeanBaptisteChamant\Desktop\DoctorPicklist\DoctorPicklist\extensions\salesforce-picklist-admin"
npm install
npm run compile
Pop-Location
```

Puis lancez VS Code avec l’extension en mode développement. Au démarrage, “Generate Metadata” s’exécute automatiquement et génère les XML depuis les CSV de test:

```powershell
# Ouvrir VS Code avec l’extension Dr Picklist chargée
code "c:\Users\JeanBaptisteChamant\Desktop\DoctorPicklist\DoctorPicklist" --extensionDevelopmentPath "c:\Users\JeanBaptisteChamant\Desktop\DoctorPicklist\DoctorPicklist\extensions\salesforce-picklist-admin"
```

Résultats attendus selon les fichiers de test:
- Local (Account.Industry.csv):
	- Génère [DrPicklist/metadata/objects/Account.object](DrPicklist/metadata/objects)
- GlobalValueSet (Industry_Global.csv):
	- Génère [DrPicklist/metadata/globalValueSets/Industry_Global.globalValueSet](DrPicklist/metadata/globalValueSets)
- StandardValueSet (Industry_Standard.csv):
	- Génère [DrPicklist/metadata/standardValueSets/Industry_Standard.standardValueSet](DrPicklist/metadata/standardValueSets)
- Dépendances (Account.Country__c__to__State__c.csv):
	- Génère [DrPicklist/metadata/objects/Account.object](DrPicklist/metadata/objects) avec `<controllingField>` et `<valueSettings>` pour `State__c`

Remarques:
- La génération en lot traite automatiquement:
	- Picklists locales nommées `Object.Field.csv`
	- GlobalValueSets nommés `Name_Global.csv`
	- StandardValueSets nommés `Name_Standard.csv`
	- Dépendances nommées `Object.Controlling__to__Dependent.csv`
- Pour GlobalValueSet, la référence de champ n’est pas créée en lot (elle nécessite l’objet/champ cible). Utilisez la commande “Dr Picklist: Import Values” (mode GlobalValueSet) pour générer simultanément le GlobalValueSet et la référence de champ si besoin.

```powershell
Push-Location "c:\Users\JeanBaptisteChamant\Desktop\DoctorPicklist\DoctorPicklist\project\deploy"
sfdx force:mdapi:deploy -d src -w -1
Pop-Location
```

## Tutoriel pas‑à‑pas
### 1) Ouvrir le projet et l’extension
1. Ouvrez VS Code sur le dossier du projet DoctorPicklist.
2. Lancez l’extension en mode développement (voir section Installation).

Astuce: au démarrage, la génération des métadonnées depuis les CSV peut s’exécuter automatiquement (paramètre activable/désactivable dans les settings: Dr Picklist → Auto Generate On Startup).

### 2) Exporter une picklist existante vers CSV
But: créer un CSV des valeurs depuis votre org.

Étapes:
- Ouvrez la palette de commandes (Ctrl+Shift+P).
- Choisissez “Dr Picklist: Export Values”.
- Saisissez `Object.Field` (exemple: `Account.Industry`).

Résultat: un CSV est créé dans [DrPicklist/csv/picklists](DrPicklist/csv/picklists), ex. [DrPicklist/csv/picklists/Account.Industry.csv](DrPicklist/csv/picklists/Account.Industry.csv).

### 3) Modifier le CSV
Ajustez les colonnes:
- Label
- APIName
- IsActive (true/false)

Exemple:
```
Label,APIName,IsActive
Manufacturing,Manufacturing,true
Technology,Technology,true
Education,Education,true
```

### 4) Importer vers XML — Choisir le mode
But: générer les fichiers XML de métadonnées.

- Ouvrez “Dr Picklist: Import Values” et sélectionnez votre CSV.
- Choisissez le mode:
	- Picklist Field (Local Value Set): écrit les valeurs dans le champ du fichier objet.
		- Sortie: [DrPicklist/metadata/objects/Object.object](DrPicklist/metadata/objects)
	- GlobalValueSet: crée un Global Value Set + référence le champ.
		- Sorties: [DrPicklist/metadata/globalValueSets/Name.globalValueSet](DrPicklist/metadata/globalValueSets) et [DrPicklist/metadata/objects/Object.object](DrPicklist/metadata/objects)
	- StandardValueSet: met à jour un Standard Value Set (ex: Industry).
		- Sortie: [DrPicklist/metadata/standardValueSets/Name.standardValueSet](DrPicklist/metadata/standardValueSets)

### 5) Gérer les dépendances de picklists (parent → enfant)
#### Exporter les dépendances
- Palette → “Dr Picklist: Export Dependencies”
- Entrez l’objet et le champ dépendant (ex: `Account` et `State__c`).
- Résultat: CSV dans [DrPicklist/csv/dependencies](DrPicklist/csv/dependencies), ex. [DrPicklist/csv/dependencies/Account.Country__c__to__State__c.csv](DrPicklist/csv/dependencies/Account.Country__c__to__State__c.csv)

Contenu attendu:
```
ControllingField,DependentField,ControllingValue,DependentValues
Country__c,State__c,France,"Île-de-France;Provence;Normandie"
Country__c,State__c,USA,"California;Texas;New York"
```

#### Importer les dépendances
- Palette → “Dr Picklist: Import Dependencies”
- Choisissez le CSV.
- Confirmez l’objet et les champs.
- Sortie: XML dans [DrPicklist/metadata/objects/Object.object](DrPicklist/metadata/objects) (ajoute `<controllingField>` et `<valueSettings>` au champ dépendant).

### 6) Générer en lot depuis tous les CSV
- Palette → “Dr Picklist: Generate Metadata”
- Traite automatiquement:
	- Picklists locales `Object.Field.csv` → [DrPicklist/metadata/objects](DrPicklist/metadata/objects)
	- GlobalValueSets `Name_Global.csv` → [DrPicklist/metadata/globalValueSets](DrPicklist/metadata/globalValueSets)
	- StandardValueSets `Name_Standard.csv` → [DrPicklist/metadata/standardValueSets](DrPicklist/metadata/standardValueSets)
	- Dépendances `Object.Controlling__to__Dependent.csv` → [DrPicklist/metadata/objects](DrPicklist/metadata/objects)

### 7) Préparer le package de déploiement (manuel)
- Palette → “Dr Picklist: Prepare Deployment Package”
- Copie les fichiers sous `project/deploy/src` et génère `project/deploy/package.xml`
- Déploiement manuel (optionnel) via Salesforce CLI:

```powershell
Push-Location "c:\Users\JeanBaptisteChamant\Desktop\DoctorPicklist\DoctorPicklist\project\deploy"
sfdx force:mdapi:deploy -d src -w -1
Pop-Location
```

## Dépannage
- sfdx introuvable: installez Salesforce CLI et re‑lancez VS Code.
- Object/Field not found: vérifiez l’orthographe (ex: `Account.Industry`) et que l’objet/champ existe.
- Aucune métadonnée générée: assurez‑vous que les CSV sont bien placés et nommés; ex. `Object.Field.csv`.
- Auto‑run au démarrage: dans les settings VS Code, recherchez “Dr Picklist” et ajustez “Auto Generate On Startup”.
