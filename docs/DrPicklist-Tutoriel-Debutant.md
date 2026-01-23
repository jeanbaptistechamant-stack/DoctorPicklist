> Ce tutoriel a été fusionné dans le README de racine. Veuillez consulter le document principal pour l’installation, les commandes et le guide pas‑à‑pas: [README.md](../README.md)

## 4) Modifier le CSV
Ouvrez le CSV généré et ajustez les colonnes:
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

## 5) Importer vers XML — Choisir le mode
But: générer les fichiers XML de métadonnées.

- Ouvrez “Dr Picklist: Import Values” et sélectionnez votre CSV.
- Choisissez le mode:
  - Picklist Field (Local Value Set): écrit les valeurs dans le champ du fichier objet.
    - Sortie: [DrPicklist/metadata/objects/Object.object](DrPicklist/metadata/objects)
  - GlobalValueSet: crée un Global Value Set + référence le champ.
    - Sorties: [DrPicklist/metadata/globalValueSets/Name.globalValueSet](DrPicklist/metadata/globalValueSets) et [DrPicklist/metadata/objects/Object.object](DrPicklist/metadata/objects)
  - StandardValueSet: met à jour un Standard Value Set (ex: Industry).
    - Sortie: [DrPicklist/metadata/standardValueSets/Name.standardValueSet](DrPicklist/metadata/standardValueSets)

## 6) Gérer les dépendances de picklists (parent → enfant)
### Exporter les dépendances
- Palette → “Dr Picklist: Export Dependencies”
- Entrez l’objet et le champ dépendant (ex: `Account` et `State__c`).
- Résultat: CSV dans [DrPicklist/csv/dependencies](DrPicklist/csv/dependencies), ex. [DrPicklist/csv/dependencies/Account.Country__c__to__State__c.csv](DrPicklist/csv/dependencies/Account.Country__c__to__State__c.csv)

Contenu attendu:
```
ControllingField,DependentField,ControllingValue,DependentValues
Country__c,State__c,France,"Île-de-France;Provence;Normandie"
Country__c,State__c,USA,"California;Texas;New York"
```

### Importer les dépendances
- Palette → “Dr Picklist: Import Dependencies”
- Choisissez le CSV.
- Confirmez l’objet et les champs.
- Sortie: XML dans [DrPicklist/metadata/objects/Object.object](DrPicklist/metadata/objects) (ajoute `<controllingField>` et `<valueSettings>` au champ dépendant).

## 7) Générer en lot depuis tous les CSV
- Palette → “Dr Picklist: Generate Metadata”
- Traite automatiquement:
  - Picklists locales `Object.Field.csv` → [DrPicklist/metadata/objects](DrPicklist/metadata/objects)
  - GlobalValueSets `Name_Global.csv` → [DrPicklist/metadata/globalValueSets](DrPicklist/metadata/globalValueSets)
  - StandardValueSets `Name_Standard.csv` → [DrPicklist/metadata/standardValueSets](DrPicklist/metadata/standardValueSets)
  - Dépendances `Object.Controlling__to__Dependent.csv` → [DrPicklist/metadata/objects](DrPicklist/metadata/objects)

## 8) Préparer le package de déploiement (manuel)
- Palette → “Dr Picklist: Prepare Deployment Package”
- Copie les fichiers sous [project/deploy/src](project/deploy/src) et génère [project/deploy/package.xml](project/deploy/package.xml)
- Déploiement manuel (optionnel) via Salesforce CLI:

```powershell
Push-Location "c:\Users\JeanBaptisteChamant\Desktop\DoctorPicklist\DoctorPicklist\project\deploy"
sfdx force:mdapi:deploy -d src -w -1
Pop-Location
```

## 9) Fichiers de test inclus
- Picklist locale: [DrPicklist/csv/picklists/Account.Industry.csv](DrPicklist/csv/picklists/Account.Industry.csv)
- GlobalValueSet: [DrPicklist/csv/picklists/Industry_Global.csv](DrPicklist/csv/picklists/Industry_Global.csv)
- StandardValueSet: [DrPicklist/csv/picklists/Industry_Standard.csv](DrPicklist/csv/picklists/Industry_Standard.csv)
- Dépendances: [DrPicklist/csv/dependencies/Account.Country__c__to__State__c.csv](DrPicklist/csv/dependencies/Account.Country__c__to__State__c.csv)

## 10) Résolution de problèmes
- sfdx introuvable: installez Salesforce CLI et re-lancez VS Code.
- Object/Field not found: vérifiez l’orthographe (ex: `Account.Industry`), et que l’objet/champ existe.
- Aucune métadonnée générée: assurez-vous que les CSV sont bien placés et nommés; ex. `Object.Field.csv`.
- Auto-run au démarrage: dans les settings VS Code, recherchez “Dr Picklist” et ajustez “Auto Generate On Startup”.
