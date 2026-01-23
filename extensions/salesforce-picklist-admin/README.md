# Dr Picklist

Extension VS Code pour administrer les listes de sélection (picklists) Salesforce via CSV.

## Commandes
- Salesforce Picklist: Export Values — Exporter une picklist vers CSV
- Salesforce Picklist: Import Values — Importer/ajouter des valeurs depuis CSV
- Salesforce Picklist: Export Dependencies — Exporter les dépendances
- Salesforce Picklist: Import Dependencies — Importer les dépendances depuis CSV
- Salesforce Picklist: Generate Metadata — Générer tous les fichiers XML
- Salesforce Picklist: Prepare Deployment Package — Préparer le package de déploiement

## Dossiers projet
- DrPicklist/csv/picklists — Exports/imports de picklists
- DrPicklist/csv/dependencies — CSV des dépendances
- DrPicklist/metadata/objects — XML générés des objets/champs

## Pré-requis
- Salesforce CLI (sfdx) installé
- Connexion à une org via `sfdx force:auth:web:login`

## Utilisation
1. Exporter une picklist pour générer le CSV
2. Modifier le CSV
3. Importer pour générer le XML de métadonnées
4. (Optionnel) Gérer les dépendances via CSV
5. Générer l’ensemble des métadonnées
6. Préparer le package pour déploiement (manuel via CLI)
