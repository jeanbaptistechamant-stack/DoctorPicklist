"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDrPicklistScaffolding = ensureDrPicklistScaffolding;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const salesforce_1 = require("./salesforce");
const dependencies_1 = require("./dependencies");
const csv_1 = require("./csv");
const metadata_1 = require("./metadata");
const deploy_1 = require("./deploy");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
async function writeErrorLog(context, err) {
    try {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws)
            return null;
        const root = ws.uri.fsPath;
        const logDir = path.join(root, 'DrPicklist', 'logs');
        await fs.mkdir(logDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(logDir, `${context}-${timestamp}.log`);
        const parts = [];
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
        const extra = {};
        for (const key of Object.keys(err || {})) {
            if (key === 'message' || key === 'stack')
                continue;
            try {
                extra[key] = err[key];
            }
            catch { }
        }
        if (Object.keys(extra).length > 0) {
            parts.push('');
            parts.push('Détails supplémentaires:');
            parts.push(JSON.stringify(extra, null, 2));
        }
        // Cas particulier : erreur de parsing Salesforce CLI avec sortie brute
        if (err?.rawOutput) {
            parts.push('');
            parts.push('Sortie Salesforce CLI complète:');
            parts.push(String(err.rawOutput));
        }
        const message = parts.join('\n');
        await fs.writeFile(filePath, message, 'utf8');
        return filePath;
    }
    catch {
        return null;
    }
}
async function ensureDrPicklistScaffolding(root) {
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
        }
        catch { }
    }
}
function activate(context) {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (ws) {
        // Prépare l'arborescence DrPicklist dans n'importe quel nouveau projet
        ensureDrPicklistScaffolding(ws.uri.fsPath).catch(() => { });
    }
    const exportValues = vscode.commands.registerCommand('drPicklist.exportValues', async () => {
        const apiField = await vscode.window.showInputBox({
            title: 'Nom API du champ',
            prompt: 'Ex: Account.Industry',
            ignoreFocusOut: true
        });
        if (!apiField) {
            return;
        }
        try {
            const [objectApi, fieldApi] = apiField.split('.');
            if (!objectApi || !fieldApi) {
                vscode.window.showErrorMessage('Format invalide. Utilisez Object.Field (ex: Account.Industry).');
                return;
            }
            const entries = await (0, salesforce_1.exportPicklistValues)(objectApi, fieldApi);
            const csvPath = await (0, csv_1.ensurePicklistCsvPath)(objectApi, fieldApi);
            await (0, csv_1.writePicklistCsv)(csvPath, entries);
            vscode.window.showInformationMessage(`Exporté: ${csvPath}`);
        }
        catch (err) {
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
            title: 'Sélectionner le CSV (Label,APIName,IsActive OU dépendances)',
            canSelectMany: false,
            filters: { 'CSV': ['csv'] }
        });
        if (!csvFile || csvFile.length === 0) {
            return;
        }
        const filePath = csvFile[0].fsPath;
        const base = filePath.split(/[\\/]/).pop() || '';
        // Détecter si c'est un CSV de dépendances
        const { isDependencyCsv } = await Promise.resolve().then(() => __importStar(require('./csv')));
        const isDep = await isDependencyCsv(filePath);
        if (isDep) {
            // C'est un CSV de dépendances - router vers la logique de dépendances
            const m = base.match(/^([^\.]+)\.([^_]+)__to__([^\.]+)\.csv$/);
            const inferredObject = m ? m[1] : '';
            const inferredControlling = m ? m[2] : '';
            const inferredDependent = m ? m[3] : '';
            const objectApi = await vscode.window.showInputBox({
                title: 'Nom API de l\'objet',
                value: inferredObject,
                prompt: 'Ex: Account',
                ignoreFocusOut: true
            });
            if (!objectApi)
                return;
            const controllingField = await vscode.window.showInputBox({
                title: 'Champ de contrôle',
                value: inferredControlling,
                prompt: 'Ex: Country__c',
                ignoreFocusOut: true
            });
            if (!controllingField)
                return;
            const dependentField = await vscode.window.showInputBox({
                title: 'Champ dépendant',
                value: inferredDependent,
                prompt: 'Ex: State__c',
                ignoreFocusOut: true
            });
            if (!dependentField)
                return;
            try {
                const rows = await (0, dependencies_1.readDependenciesCsv)(filePath);
                if (rows.length === 0) {
                    vscode.window.showWarningMessage('CSV de dépendances vide ou invalide.');
                    return;
                }
                const details = await (0, salesforce_1.getFieldDetailsOrRetrieve)(objectApi, dependentField);
                const xml = (0, metadata_1.buildDependentPicklistXml)(dependentField, controllingField, rows, details);
                const outPath = await (0, metadata_1.writeFieldMetadata)(objectApi, dependentField, xml);
                vscode.window.showInformationMessage(`Champ dépendant mis à jour: ${outPath}`);
            }
            catch (err) {
                const logPath = await writeErrorLog('import-dependencies', err);
                let msg = `Échec mise à jour champ dépendant: ${err?.message || String(err)}`;
                if (/Métadonnées.*introuvables/i.test(String(err?.message || ''))) {
                    msg = String(err?.message || err);
                }
                if (logPath) {
                    msg += `\n\nVoir log: ${logPath}`;
                }
                vscode.window.showErrorMessage(msg);
            }
            return;
        }
        // C'est un CSV de picklist normale - continuer avec la logique normale
        let inferredObject = '';
        let inferredField = '';
        const m = base.match(/^([^\.]+)\.([^\.]+)\.csv$/);
        if (m) {
            inferredObject = m[1];
            inferredField = m[2];
        }
        const modePick = await vscode.window.showQuickPick([
            { label: 'Auto (détection champ)', description: 'Choisit Standard/Local automatiquement selon le champ' },
            { label: 'Picklist Field (Local Value Set)', description: 'Définit directement la liste de valeurs sur le champ' },
            { label: 'GlobalValueSet', description: 'Crée un Global Value Set et référence-le depuis le champ' },
            { label: 'StandardValueSet', description: 'Crée/Met à jour un Standard Value Set' }
        ], { title: 'Choisir le mode de génération', ignoreFocusOut: true });
        if (!modePick)
            return;
        let objectApi = '';
        let fieldApi = '';
        if (modePick.label !== 'StandardValueSet') {
            objectApi = await vscode.window.showInputBox({
                title: 'Nom API de l’objet',
                prompt: 'Ex: Account',
                value: inferredObject,
                ignoreFocusOut: true
            }) || '';
            if (!objectApi)
                return;
            fieldApi = await vscode.window.showInputBox({
                title: 'Nom API du champ',
                prompt: 'Ex: Industry ou MyField__c',
                value: inferredField,
                ignoreFocusOut: true
            }) || '';
            if (!fieldApi)
                return;
        }
        try {
            const entries = await (0, csv_1.readPicklistCsv)(filePath);
            if (entries.length === 0) {
                vscode.window.showWarningMessage('CSV vide ou invalide.');
                return;
            }
            let mode = modePick.label;
            if (modePick.label === 'Auto (détection champ)') {
                const details = await (0, salesforce_1.getFieldDetailsOrRetrieve)(objectApi, fieldApi);
                if (!details) {
                    mode = 'Picklist Field (Local Value Set)';
                }
                else if (details.valueSetName) {
                    // Si le champ référence un valueSet nommé, c'est soit Global soit Standard
                    if (!details.custom && /picklist/i.test(details.type || '')) {
                        // Champ standard avec valueSet = StandardValueSet
                        mode = 'StandardValueSet';
                    }
                    else {
                        // Champ custom avec valueSet = GlobalValueSet
                        mode = 'GlobalValueSet';
                    }
                }
                else {
                    // Pas de valueSet nommé = local value set
                    mode = 'Picklist Field (Local Value Set)';
                }
            }
            if (mode === 'Picklist Field (Local Value Set)') {
                const details = await (0, salesforce_1.getFieldDetailsOrRetrieve)(objectApi, fieldApi);
                const xml = (0, metadata_1.buildPicklistFieldXml)(objectApi, fieldApi, entries, details);
                const outPath = await (0, metadata_1.writeFieldMetadata)(objectApi, fieldApi, xml);
                vscode.window.showInformationMessage(`XML champ (local) généré: ${outPath}`);
            }
            else if (mode === 'GlobalValueSet') {
                const valueSetName = await vscode.window.showInputBox({
                    title: 'Nom du GlobalValueSet',
                    prompt: 'Ex: Industry_Global',
                    value: `${objectApi}_${fieldApi}_GVS`,
                    ignoreFocusOut: true
                }) || '';
                if (!valueSetName)
                    return;
                const gxml = (0, metadata_1.buildGlobalValueSetXml)(valueSetName, entries);
                const gOut = await (0, metadata_1.writeGlobalValueSet)(valueSetName, gxml);
                const details = await (0, salesforce_1.getFieldDetailsOrRetrieve)(objectApi, fieldApi);
                const fxml = (0, metadata_1.buildPicklistFieldGlobalRefXml)(fieldApi, valueSetName, details);
                const fOut = await (0, metadata_1.writeFieldMetadata)(objectApi, fieldApi, fxml);
                vscode.window.showInformationMessage(`GlobalValueSet généré: ${gOut}`);
                vscode.window.showInformationMessage(`Champ référencé au GlobalValueSet: ${fOut}`);
            }
            else if (mode === 'StandardValueSet') {
                const valueSetName = await vscode.window.showInputBox({
                    title: 'Nom du StandardValueSet',
                    prompt: 'Ex: Industry',
                    value: inferredField || 'Industry',
                    ignoreFocusOut: true
                }) || '';
                if (!valueSetName)
                    return;
                const sxml = (0, metadata_1.buildStandardValueSetXml)(valueSetName, entries);
                const sOut = await (0, metadata_1.writeStandardValueSet)(valueSetName, sxml);
                vscode.window.showInformationMessage(`StandardValueSet généré: ${sOut}`);
            }
        }
        catch (err) {
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
        if (!objectApi)
            return;
        const dependentField = await vscode.window.showInputBox({ title: 'Champ dépendant', prompt: 'Ex: State__c', ignoreFocusOut: true });
        if (!dependentField)
            return;
        try {
            const csvPath = await (0, dependencies_1.exportDependencies)(objectApi, dependentField);
            vscode.window.showInformationMessage(`Dépendances exportées: ${csvPath}`);
        }
        catch (err) {
            const msg = String(err?.message || err);
            if (/Aucun champ de contrôle défini/i.test(msg)) {
                // Prompt for controlling field when auto-detection fails
                try {
                    const candidates = await (0, dependencies_1.listPicklistFields)(objectApi);
                    const controllingField = await vscode.window.showQuickPick(candidates.map(c => ({ label: c })), { title: 'Sélectionner le champ de contrôle (picklist)', placeHolder: 'Ex: Country__c', ignoreFocusOut: true });
                    if (!controllingField?.label) {
                        vscode.window.showErrorMessage('Aucun champ de contrôle sélectionné.');
                        return;
                    }
                    const csvPath2 = await (0, dependencies_1.exportDependenciesWithController)(objectApi, dependentField, controllingField.label);
                    vscode.window.showInformationMessage(`Dépendances exportées: ${csvPath2}`);
                }
                catch (err2) {
                    const logPath = await writeErrorLog('export-dependencies', err2);
                    let emsg = `Échec export dépendances: ${err2?.message || String(err2)}`;
                    if (logPath) {
                        emsg += ` (voir log: ${logPath})`;
                    }
                    vscode.window.showErrorMessage(emsg);
                }
            }
            else {
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
        if (!csvFile || csvFile.length === 0) {
            return;
        }
        const filePath = csvFile[0].fsPath;
        const base = filePath.split(/[\\/]/).pop() || '';
        const m = base.match(/^([^\.]+)\.([^_]+)__to__([^\.]+)\.csv$/);
        const inferredObject = m ? m[1] : '';
        const inferredControlling = m ? m[2] : '';
        const inferredDependent = m ? m[3] : '';
        const objectApi = await vscode.window.showInputBox({ title: 'Objet', value: inferredObject, prompt: 'Ex: Account', ignoreFocusOut: true });
        if (!objectApi)
            return;
        const controllingField = await vscode.window.showInputBox({ title: 'Champ de contrôle', value: inferredControlling, prompt: 'Ex: Country__c', ignoreFocusOut: true });
        if (!controllingField)
            return;
        const dependentField = await vscode.window.showInputBox({ title: 'Champ dépendant', value: inferredDependent, prompt: 'Ex: State__c', ignoreFocusOut: true });
        if (!dependentField)
            return;
        try {
            const rows = await (0, dependencies_1.readDependenciesCsv)(filePath);
            const details = await (0, salesforce_1.getFieldDetailsOrRetrieve)(objectApi, dependentField);
            const xml = (0, metadata_1.buildDependentPicklistXml)(dependentField, controllingField, rows, details);
            const outPath = await (0, metadata_1.writeFieldMetadata)(objectApi, dependentField, xml);
            vscode.window.showInformationMessage(`XML dépendances généré: ${outPath}`);
        }
        catch (err) {
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
            if (!ws)
                throw new Error('Aucun workspace ouvert.');
            const root = ws.uri.fsPath;
            const pickDir = path.join(root, 'DrPicklist', 'csv', 'picklists');
            const depDir = path.join(root, 'DrPicklist', 'csv', 'dependencies');
            // Process picklists (local / global / standard value set)
            try {
                const files = await fs.readdir(pickDir);
                for (const f of files) {
                    if (!f.endsWith('.csv'))
                        continue;
                    // Local picklist: Object.Field.csv
                    const localMatch = f.match(/^([^\.]+)\.([^\.]+)\.csv$/);
                    if (localMatch) {
                        const [, objectApi, fieldApi] = localMatch;
                        const entries = await (0, csv_1.readPicklistCsv)(path.join(pickDir, f));
                        const details = await (0, salesforce_1.getFieldDetailsOrRetrieve)(objectApi, fieldApi);
                        // Déterminer le type de value set en fonction des détails du champ
                        if (details?.valueSetName) {
                            // Le champ référence un valueSet nommé
                            if (!details.custom && /picklist/i.test(details.type || '')) {
                                // Champ standard avec valueSet = StandardValueSet
                                const valueSetName = details.valueSetName;
                                const sxml = (0, metadata_1.buildStandardValueSetXml)(valueSetName, entries);
                                await (0, metadata_1.writeStandardValueSet)(valueSetName, sxml);
                            }
                            else {
                                // Champ custom avec valueSet = GlobalValueSet
                                const valueSetName = details.valueSetName;
                                const gxml = (0, metadata_1.buildGlobalValueSetXml)(valueSetName, entries);
                                await (0, metadata_1.writeGlobalValueSet)(valueSetName, gxml);
                                // Générer aussi la référence du champ vers le GlobalValueSet
                                const fxml = (0, metadata_1.buildPicklistFieldGlobalRefXml)(fieldApi, valueSetName, details);
                                await (0, metadata_1.writeFieldMetadata)(objectApi, fieldApi, fxml);
                            }
                        }
                        else {
                            // Pas de valueSet nommé = local value set
                            const xml = (0, metadata_1.buildPicklistFieldXml)(objectApi, fieldApi, entries, details);
                            await (0, metadata_1.writeFieldMetadata)(objectApi, fieldApi, xml);
                        }
                        continue;
                    }
                    // GlobalValueSet: Name_Global.csv
                    const gvsMatch = f.match(/^(.+)_Global\.csv$/);
                    if (gvsMatch) {
                        const [, valueSetName] = gvsMatch;
                        const entries = await (0, csv_1.readPicklistCsv)(path.join(pickDir, f));
                        const gxml = (0, metadata_1.buildGlobalValueSetXml)(valueSetName, entries);
                        await (0, metadata_1.writeGlobalValueSet)(valueSetName, gxml);
                        continue;
                    }
                    // StandardValueSet: Name_Standard.csv
                    const svsMatch = f.match(/^(.+)_Standard\.csv$/);
                    if (svsMatch) {
                        const [, valueSetName] = svsMatch;
                        const entries = await (0, csv_1.readPicklistCsv)(path.join(pickDir, f));
                        const sxml = (0, metadata_1.buildStandardValueSetXml)(valueSetName, entries);
                        await (0, metadata_1.writeStandardValueSet)(valueSetName, sxml);
                        continue;
                    }
                }
            }
            catch { }
            // Process dependencies
            try {
                const files = await fs.readdir(depDir);
                for (const f of files) {
                    if (!f.endsWith('.csv'))
                        continue;
                    const m = f.match(/^([^\.]+)\.([^_]+)__to__([^\.]+)\.csv$/);
                    if (!m)
                        continue;
                    const [, objectApi, controllingField, dependentField] = m;
                    try {
                        const rows = await (await Promise.resolve().then(() => __importStar(require('./dependencies')))).readDependenciesCsv(path.join(depDir, f));
                        if (rows.length === 0)
                            continue;
                        const details = await (0, salesforce_1.getFieldDetailsOrRetrieve)(objectApi, dependentField);
                        const xml = (0, metadata_1.buildDependentPicklistXml)(dependentField, controllingField, rows, details);
                        await (0, metadata_1.writeFieldMetadata)(objectApi, dependentField, xml);
                    }
                    catch (err) {
                        // Log l'erreur mais continue avec les autres fichiers
                        console.warn(`Impossible de traiter ${f}:`, err);
                    }
                }
            }
            catch { }
            vscode.window.showInformationMessage('Métadonnées générées à partir des CSV.');
        }
        catch (err) {
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
            const { packageXml, copied } = await (0, deploy_1.prepareDeploymentPackage)('59.0');
            vscode.window.showInformationMessage(`Package prêt: ${packageXml}`);
            if (copied.length === 0) {
                vscode.window.showWarningMessage('Aucun fichier de métadonnées trouvé à copier.');
            }
        }
        catch (err) {
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
        }
        catch (err) {
            const logPath = await writeErrorLog('init-project', err);
            let msg = `Échec de l'initialisation DrPicklist: ${err?.message || String(err)}`;
            if (logPath) {
                msg += ` (voir log: ${logPath})`;
            }
            vscode.window.showErrorMessage(msg);
        }
    });
    const updateDependentField = vscode.commands.registerCommand('drPicklist.updateDependentField', async () => {
        const csvFile = await vscode.window.showOpenDialog({
            title: 'Sélectionner le CSV de dépendances',
            canSelectMany: false,
            filters: { 'CSV': ['csv'] }
        });
        if (!csvFile || csvFile.length === 0) {
            return;
        }
        const filePath = csvFile[0].fsPath;
        const base = filePath.split(/[\\/]/).pop() || '';
        const m = base.match(/^([^\.]+)\.([^_]+)__to__([^\.]+)\.csv$/);
        const inferredObject = m ? m[1] : '';
        const inferredControlling = m ? m[2] : '';
        const inferredDependent = m ? m[3] : '';
        const objectApi = await vscode.window.showInputBox({ title: 'Objet', value: inferredObject, prompt: 'Ex: Account', ignoreFocusOut: true });
        if (!objectApi)
            return;
        const controllingField = await vscode.window.showInputBox({ title: 'Champ de contrôle', value: inferredControlling, prompt: 'Ex: Country__c', ignoreFocusOut: true });
        if (!controllingField)
            return;
        const dependentField = await vscode.window.showInputBox({ title: 'Champ dépendant', value: inferredDependent, prompt: 'Ex: State__c', ignoreFocusOut: true });
        if (!dependentField)
            return;
        try {
            const rows = await (0, dependencies_1.readDependenciesCsv)(filePath);
            if (rows.length === 0) {
                vscode.window.showWarningMessage('CSV de dépendances vide ou invalide.');
                return;
            }
            const details = await (0, salesforce_1.getFieldDetailsOrRetrieve)(objectApi, dependentField);
            const xml = (0, metadata_1.buildDependentPicklistXml)(dependentField, controllingField, rows, details);
            const outPath = await (0, metadata_1.writeFieldMetadata)(objectApi, dependentField, xml);
            vscode.window.showInformationMessage(`Champ dépendant généré: ${outPath}`);
        }
        catch (err) {
            const logPath = await writeErrorLog('update-dependent-field', err);
            let msg = `Échec mise à jour champ dépendant: ${err?.message || String(err)}`;
            if (/Métadonnées.*introuvables/i.test(String(err?.message || ''))) {
                msg = String(err?.message || err);
            }
            if (logPath) {
                msg += `\n\nVoir log: ${logPath}`;
            }
            vscode.window.showErrorMessage(msg);
        }
    });
    context.subscriptions.push(exportValues, importValues, exportDeps, importDeps, generateMetadata, prepareDeployment, initProject, updateDependentField);
    try {
        const auto = vscode.workspace.getConfiguration('drPicklist').get('autoGenerateOnStartup', true);
        if (auto) {
            vscode.commands.executeCommand('drPicklist.generateMetadata');
        }
    }
    catch { }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map