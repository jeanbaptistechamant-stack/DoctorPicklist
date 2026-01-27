import * as vscode from 'vscode';
import { exportPicklistValues, getFieldInfo, getFieldDetailsOrRetrieve } from './salesforce';
import { exportDependencies, exportDependenciesWithController, listPicklistFields, readDependenciesCsv } from './dependencies';
import { ensureDependenciesCsvPath } from './dependencies';
import { ensurePicklistCsvPath, writePicklistCsv, readPicklistCsv } from './csv';
import { buildPicklistFieldXml, writeFieldMetadata, buildGlobalValueSetXml, writeGlobalValueSet, buildPicklistFieldGlobalRefXml, buildStandardValueSetXml, writeStandardValueSet, buildDependentPicklistXml } from './metadata';
import { prepareDeploymentPackage } from './deploy';
import * as fs from 'fs/promises';
import * as path from 'path';

async function writeErrorLog(context: string, err: any): Promise<string | null> {
  try {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return null;
    const root = ws.uri.fsPath;
    const logDir = path.join(root, 'DrPicklist', 'logs');
    await fs.mkdir(logDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(logDir, `${context}-${timestamp}.log`);
    const parts: string[] = [];
    parts.push(`Contexte: ${context}`);
    parts.push(`Date: ${new Date().toISOString()}`);
    parts.push('');

    // Message et stack de base
    if (err?.message) {
      parts.push(`Message: ${String(err.message)}`);
    }
    if (err?.stack) {
      parts.push('Stack:');
      parts.push(String(err.stack));
    }

    // Détails supplémentaires sérialisés ( propriétés énumérables )
    const extra: any = {};
    for (const key of Object.keys(err || {})) {
      if (key === 'message' || key === 'stack') continue;
      try {
        (extra as any)[key] = (err as any)[key];
      } catch {}
    }
    if (Object.keys(extra).length > 0) {
      parts.push('');
      parts.push('Détails supplémentaires:');
      parts.push(JSON.stringify(extra, null, 2));
    }

    // Cas particulier : erreur de parsing SFDX avec sortie brute
    if ((err as any)?.rawOutput) {
      parts.push('');
      parts.push('Sortie SFDX complète:');
      parts.push(String((err as any).rawOutput));
    }

    const message = parts.join('\n');
    await fs.writeFile(filePath, message, 'utf8');
    return filePath;
  } catch {
    return null;
  }
}

export async function ensureDrPicklistScaffolding(root: string): Promise<void> {
  const dirs = [
    path.join(root, 'DrPicklist'),
    path.join(root, 'DrPicklist', 'csv'),
    path.join(root, 'DrPicklist', 'csv', 'picklists'),
    path.join(root, 'DrPicklist', 'csv', 'dependencies'),
    path.join(root, 'DrPicklist', 'metadata'),
    path.join(root, 'DrPicklist', 'metadata', 'objects'),
    path.join(root, 'DrPicklist', 'metadata', 'globalValueSets'),
    path.join(root, 'DrPicklist', 'metadata', 'standardValueSets'),
    path.join(root, 'DrPicklist', 'deploy')
  ];
  for (const d of dirs) {
    try {
      await fs.mkdir(d, { recursive: true });
    } catch {}
  }
}

export function activate(context: vscode.ExtensionContext) {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (ws) {
    // Prépare l'arborescence DrPicklist dans n'importe quel nouveau projet
    ensureDrPicklistScaffolding(ws.uri.fsPath).catch(() => {});
  }

  const exportValues = vscode.commands.registerCommand('drPicklist.exportValues', async () => {
    const apiField = await vscode.window.showInputBox({
      title: 'Nom API du champ',
      prompt: 'Ex: Account.Industry',
      ignoreFocusOut: true
    });
    if (!apiField) { return; }
    try {
      const [objectApi, fieldApi] = apiField.split('.') as [string, string];
      if (!objectApi || !fieldApi) {
        vscode.window.showErrorMessage('Format invalide. Utilisez Object.Field (ex: Account.Industry).');
        return;
      }
      const entries = await exportPicklistValues(objectApi, fieldApi);
      const csvPath = await ensurePicklistCsvPath(objectApi, fieldApi);
      await writePicklistCsv(csvPath, entries);
      vscode.window.showInformationMessage(`Exporté: ${csvPath}`);
    } catch (err: any) {
      const logPath = await writeErrorLog('export-values', err);
      let msg = `Échec export: ${err?.message || String(err)}`;
      if (logPath) {
        msg += ` (voir log: ${logPath})`;
      }
      vscode.window.showErrorMessage(msg);
    }
  });

  const importValues = vscode.commands.registerCommand('drPicklist.importValues', async () => {
    const csvFile = await vscode.window.showOpenDialog({
      title: 'Sélectionner le CSV (Label,APIName,IsActive)',
      canSelectMany: false,
      filters: { 'CSV': ['csv'] }
    });
    if (!csvFile || csvFile.length === 0) { return; }
    const filePath = csvFile[0].fsPath;
    const base = filePath.split(/[\\/]/).pop() || '';
    let inferredObject = '';
    let inferredField = '';
    const m = base.match(/^([^\.]+)\.([^\.]+)\.csv$/);
    if (m) { inferredObject = m[1]; inferredField = m[2]; }
    const modePick = await vscode.window.showQuickPick([
      { label: 'Auto (détection champ)', description: 'Choisit Standard/Local automatiquement selon le champ' },
      { label: 'Picklist Field (Local Value Set)', description: 'Définit directement la liste de valeurs sur le champ' },
      { label: 'GlobalValueSet', description: 'Crée un Global Value Set et référence-le depuis le champ' },
      { label: 'StandardValueSet', description: 'Crée/Met à jour un Standard Value Set' }
    ], { title: 'Choisir le mode de génération', ignoreFocusOut: true });
    if (!modePick) return;

    let objectApi = '';
    let fieldApi = '';
    if (modePick.label !== 'StandardValueSet') {
      objectApi = await vscode.window.showInputBox({
        title: 'Nom API de l’objet',
        prompt: 'Ex: Account',
        value: inferredObject,
        ignoreFocusOut: true
      }) || '';
      if (!objectApi) return;
      fieldApi = await vscode.window.showInputBox({
        title: 'Nom API du champ',
        prompt: 'Ex: Industry ou MyField__c',
        value: inferredField,
        ignoreFocusOut: true
      }) || '';
      if (!fieldApi) return;
    }

    try {
      const entries = await readPicklistCsv(filePath);
      if (entries.length === 0) {
        vscode.window.showWarningMessage('CSV vide ou invalide.');
        return;
      }
      let mode = modePick.label;
      if (modePick.label === 'Auto (détection champ)') {
        const details = await getFieldDetailsOrRetrieve(objectApi, fieldApi);
        if (!details) {
          mode = 'Picklist Field (Local Value Set)';
        } else if (details.valueSetName) {
          // Si le champ référence un valueSet nommé, c'est soit Global soit Standard
          if (!details.custom && /picklist/i.test(details.type || '')) {
            // Champ standard avec valueSet = StandardValueSet
            mode = 'StandardValueSet';
          } else {
            // Champ custom avec valueSet = GlobalValueSet
            mode = 'GlobalValueSet';
          }
        } else {
          // Pas de valueSet nommé = local value set
          mode = 'Picklist Field (Local Value Set)';
        }
      }

      if (mode === 'Picklist Field (Local Value Set)') {
        const details = await getFieldDetailsOrRetrieve(objectApi, fieldApi);
        const xml = buildPicklistFieldXml(objectApi, fieldApi, entries, details);
        const outPath = await writeFieldMetadata(objectApi, fieldApi, xml);
        vscode.window.showInformationMessage(`XML champ (local) généré: ${outPath}`);
      } else if (mode === 'GlobalValueSet') {
        const valueSetName = await vscode.window.showInputBox({
          title: 'Nom du GlobalValueSet',
          prompt: 'Ex: Industry_Global',
          value: `${objectApi}_${fieldApi}_GVS`,
          ignoreFocusOut: true
        }) || '';
        if (!valueSetName) return;
        const gxml = buildGlobalValueSetXml(valueSetName, entries);
        const gOut = await writeGlobalValueSet(valueSetName, gxml);
        const details = await getFieldDetailsOrRetrieve(objectApi, fieldApi);
        const fxml = buildPicklistFieldGlobalRefXml(fieldApi, valueSetName, details);
        const fOut = await writeFieldMetadata(objectApi, fieldApi, fxml);
        vscode.window.showInformationMessage(`GlobalValueSet généré: ${gOut}`);
        vscode.window.showInformationMessage(`Champ référencé au GlobalValueSet: ${fOut}`);
      } else if (mode === 'StandardValueSet') {
        const valueSetName = await vscode.window.showInputBox({
          title: 'Nom du StandardValueSet',
          prompt: 'Ex: Industry',
          value: inferredField || 'Industry',
          ignoreFocusOut: true
        }) || '';
        if (!valueSetName) return;
        const sxml = buildStandardValueSetXml(valueSetName, entries);
        const sOut = await writeStandardValueSet(valueSetName, sxml);
        vscode.window.showInformationMessage(`StandardValueSet généré: ${sOut}`);
      }
    } catch (err: any) {
      const logPath = await writeErrorLog('import-values', err);
      let msg = `Échec import XML: ${err?.message || String(err)}`;
      
      // Si l'erreur mentionne des métadonnées introuvables, ajouter des instructions
      if (/Métadonnées.*introuvables/i.test(String(err?.message || ''))) {
        msg = String(err?.message || err);
      }
      
      if (logPath) {
        msg += `\n\nVoir log: ${logPath}`;
      }
      vscode.window.showErrorMessage(msg);
    }
  });

  const exportDeps = vscode.commands.registerCommand('drPicklist.exportDependencies', async () => {
    const objectApi = await vscode.window.showInputBox({ title: 'Objet', prompt: 'Ex: Account', ignoreFocusOut: true });
    if (!objectApi) return;
    const dependentField = await vscode.window.showInputBox({ title: 'Champ dépendant', prompt: 'Ex: State__c', ignoreFocusOut: true });
    if (!dependentField) return;
    try {
      const csvPath = await exportDependencies(objectApi, dependentField);
      vscode.window.showInformationMessage(`Dépendances exportées: ${csvPath}`);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (/Aucun champ de contrôle défini/i.test(msg)) {
        // Prompt for controlling field when auto-detection fails
        try {
          const candidates = await listPicklistFields(objectApi);
          const controllingField = await vscode.window.showQuickPick(
            candidates.map(c => ({ label: c })),
            { title: 'Sélectionner le champ de contrôle (picklist)', placeHolder: 'Ex: Country__c', ignoreFocusOut: true }
          );
          if (!controllingField?.label) {
            vscode.window.showErrorMessage('Aucun champ de contrôle sélectionné.');
            return;
          }
          const csvPath2 = await exportDependenciesWithController(objectApi, dependentField, controllingField.label);
          vscode.window.showInformationMessage(`Dépendances exportées: ${csvPath2}`);
        } catch (err2: any) {
          const logPath = await writeErrorLog('export-dependencies', err2);
          let emsg = `Échec export dépendances: ${err2?.message || String(err2)}`;
          if (logPath) {
            emsg += ` (voir log: ${logPath})`;
          }
          vscode.window.showErrorMessage(emsg);
        }
      } else {
        const logPath = await writeErrorLog('export-dependencies', err);
        let emsg = `Échec export dépendances: ${msg}`;
        if (logPath) {
          emsg += ` (voir log: ${logPath})`;
        }
        vscode.window.showErrorMessage(emsg);
      }
    }
  });

  const importDeps = vscode.commands.registerCommand('drPicklist.importDependencies', async () => {
    const csvFile = await vscode.window.showOpenDialog({
      title: 'Sélectionner le CSV de dépendances',
      canSelectMany: false,
      filters: { 'CSV': ['csv'] }
    });
    if (!csvFile || csvFile.length === 0) { return; }
    const filePath = csvFile[0].fsPath;
    const base = filePath.split(/[\\/]/).pop() || '';
    const m = base.match(/^([^\.]+)\.([^_]+)__to__([^\.]+)\.csv$/);
    const inferredObject = m ? m[1] : '';
    const inferredControlling = m ? m[2] : '';
    const inferredDependent = m ? m[3] : '';

    const objectApi = await vscode.window.showInputBox({ title: 'Objet', value: inferredObject, prompt: 'Ex: Account', ignoreFocusOut: true });
    if (!objectApi) return;
    const controllingField = await vscode.window.showInputBox({ title: 'Champ de contrôle', value: inferredControlling, prompt: 'Ex: Country__c', ignoreFocusOut: true });
    if (!controllingField) return;
    const dependentField = await vscode.window.showInputBox({ title: 'Champ dépendant', value: inferredDependent, prompt: 'Ex: State__c', ignoreFocusOut: true });
    if (!dependentField) return;

    try {
      const rows = await readDependenciesCsv(filePath);
      const details = await getFieldDetailsOrRetrieve(objectApi, dependentField);
      const xml = buildDependentPicklistXml(dependentField, controllingField, rows, details);
      const outPath = await writeFieldMetadata(objectApi, dependentField, xml);
      vscode.window.showInformationMessage(`XML dépendances généré: ${outPath}`);
    } catch (err: any) {
      const logPath = await writeErrorLog('import-dependencies', err);
      let msg = `Échec import dépendances: ${err?.message || String(err)}`;
      if (logPath) {
        msg += ` (voir log: ${logPath})`;
      }
      vscode.window.showErrorMessage(msg);
    }
  });

  const generateMetadata = vscode.commands.registerCommand('drPicklist.generateMetadata', async () => {
    vscode.window.showInformationMessage('Génération des métadonnées depuis les CSV');
    // TODO: generate all XML files based on CSV contents
    try {
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) throw new Error('Aucun workspace ouvert.');
      const root = ws.uri.fsPath;
      const pickDir = path.join(root, 'DrPicklist', 'csv', 'picklists');
      const depDir = path.join(root, 'DrPicklist', 'csv', 'dependencies');

      // Process picklists (local / global / standard value set)
      try {
        const files = await fs.readdir(pickDir);
        for (const f of files) {
          if (!f.endsWith('.csv')) continue;
          // Local picklist: Object.Field.csv
          const localMatch = f.match(/^([^\.]+)\.([^\.]+)\.csv$/);
          if (localMatch) {
            const [ , objectApi, fieldApi ] = localMatch;
            const entries = await readPicklistCsv(path.join(pickDir, f));
            const details = await getFieldDetailsOrRetrieve(objectApi, fieldApi);
            
            // Déterminer le type de value set en fonction des détails du champ
            if (details?.valueSetName) {
              // Le champ référence un valueSet nommé
              if (!details.custom && /picklist/i.test(details.type || '')) {
                // Champ standard avec valueSet = StandardValueSet
                const valueSetName = details.valueSetName;
                const sxml = buildStandardValueSetXml(valueSetName, entries);
                await writeStandardValueSet(valueSetName, sxml);
              } else {
                // Champ custom avec valueSet = GlobalValueSet
                const valueSetName = details.valueSetName;
                const gxml = buildGlobalValueSetXml(valueSetName, entries);
                await writeGlobalValueSet(valueSetName, gxml);
                // Générer aussi la référence du champ vers le GlobalValueSet
                const fxml = buildPicklistFieldGlobalRefXml(fieldApi, valueSetName, details);
                await writeFieldMetadata(objectApi, fieldApi, fxml);
              }
            } else {
              // Pas de valueSet nommé = local value set
              const xml = buildPicklistFieldXml(objectApi, fieldApi, entries, details);
              await writeFieldMetadata(objectApi, fieldApi, xml);
            }
            continue;
          }
          // GlobalValueSet: Name_Global.csv
          const gvsMatch = f.match(/^(.+)_Global\.csv$/);
          if (gvsMatch) {
            const [ , valueSetName ] = gvsMatch;
            const entries = await readPicklistCsv(path.join(pickDir, f));
            const gxml = buildGlobalValueSetXml(valueSetName, entries);
            await writeGlobalValueSet(valueSetName, gxml);
            continue;
          }
          // StandardValueSet: Name_Standard.csv
          const svsMatch = f.match(/^(.+)_Standard\.csv$/);
          if (svsMatch) {
            const [ , valueSetName ] = svsMatch;
            const entries = await readPicklistCsv(path.join(pickDir, f));
            const sxml = buildStandardValueSetXml(valueSetName, entries);
            await writeStandardValueSet(valueSetName, sxml);
            continue;
          }
        }
      } catch {}

      // Process dependencies
      try {
        const files = await fs.readdir(depDir);
        for (const f of files) {
          if (!f.endsWith('.csv')) continue;
          const m = f.match(/^([^\.]+)\.([^_]+)__to__([^\.]+)\.csv$/);
          if (!m) continue;
          const [ , objectApi, controllingField, dependentField ] = m;
          const rows = await (await import('./dependencies')).readDependenciesCsv(path.join(depDir, f));
          const details = await getFieldDetailsOrRetrieve(objectApi, dependentField);
          const xml = buildDependentPicklistXml(dependentField, controllingField, rows, details);
          await writeFieldMetadata(objectApi, dependentField, xml);
        }
      } catch {}

      vscode.window.showInformationMessage('Métadonnées générées à partir des CSV.');
    } catch (err: any) {
      const logPath = await writeErrorLog('generate-metadata', err);
      let msg = `Échec génération: ${err?.message || String(err)}`;
      
      // Si l'erreur mentionne des métadonnées introuvables, afficher le message complet
      if (/Métadonnées.*introuvables/i.test(String(err?.message || ''))) {
        msg = String(err?.message || err);
      }
      
      if (logPath) {
        msg += `\n\nVoir log: ${logPath}`;
      }
      vscode.window.showErrorMessage(msg);
    }
  });

  const prepareDeployment = vscode.commands.registerCommand('drPicklist.prepareDeployment', async () => {
    try {
      const { packageXml, copied } = await prepareDeploymentPackage('59.0');
      vscode.window.showInformationMessage(`Package prêt: ${packageXml}`);
      if (copied.length === 0) {
        vscode.window.showWarningMessage('Aucun fichier de métadonnées trouvé à copier.');
      }
    } catch (err: any) {
      const logPath = await writeErrorLog('prepare-deployment', err);
      let msg = `Échec préparation package: ${err?.message || String(err)}`;
      if (logPath) {
        msg += ` (voir log: ${logPath})`;
      }
      vscode.window.showErrorMessage(msg);
    }
  });

  const initProject = vscode.commands.registerCommand('drPicklist.initProject', async () => {
    try {
      const ws2 = vscode.workspace.workspaceFolders?.[0];
      if (!ws2) {
        vscode.window.showErrorMessage('Aucun workspace ouvert. Ouvrez la racine de votre projet Salesforce.');
        return;
      }
      await ensureDrPicklistScaffolding(ws2.uri.fsPath);
      vscode.window.showInformationMessage('Dossier DrPicklist initialisé pour ce projet.');
    } catch (err: any) {
      const logPath = await writeErrorLog('init-project', err);
      let msg = `Échec de l'initialisation DrPicklist: ${err?.message || String(err)}`;
      if (logPath) {
        msg += ` (voir log: ${logPath})`;
      }
      vscode.window.showErrorMessage(msg);
    }
  });

  context.subscriptions.push(
    exportValues,
    importValues,
    exportDeps,
    importDeps,
    generateMetadata,
    prepareDeployment,
    initProject
  );

  try {
    const auto = vscode.workspace.getConfiguration('drPicklist').get<boolean>('autoGenerateOnStartup', true);
    if (auto) {
      vscode.commands.executeCommand('drPicklist.generateMetadata');
    }
  } catch {}
}

export function deactivate() {}
