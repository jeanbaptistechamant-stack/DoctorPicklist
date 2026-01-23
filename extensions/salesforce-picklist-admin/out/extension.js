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
function activate(context) {
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
            vscode.window.showErrorMessage(`Échec export: ${err?.message || String(err)}`);
        }
    });
    const importValues = vscode.commands.registerCommand('drPicklist.importValues', async () => {
        const csvFile = await vscode.window.showOpenDialog({
            title: 'Sélectionner le CSV (Label,APIName,IsActive)',
            canSelectMany: false,
            filters: { 'CSV': ['csv'] }
        });
        if (!csvFile || csvFile.length === 0) {
            return;
        }
        const filePath = csvFile[0].fsPath;
        const base = filePath.split(/[\\/]/).pop() || '';
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
                const info = await (0, salesforce_1.getFieldInfo)(objectApi, fieldApi);
                if (info.type.toLowerCase() === 'picklist' && !info.custom) {
                    mode = 'StandardValueSet';
                }
                else {
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
            vscode.window.showErrorMessage(`Échec import XML: ${err?.message || String(err)}`);
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
                    vscode.window.showErrorMessage(`Échec export dépendances: ${err2?.message || String(err2)}`);
                }
            }
            else {
                vscode.window.showErrorMessage(`Échec export dépendances: ${msg}`);
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
            vscode.window.showErrorMessage(`Échec import dépendances: ${err?.message || String(err)}`);
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
            // Process picklists (local value set)
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
                        const xml = (0, metadata_1.buildPicklistFieldXml)(objectApi, fieldApi, entries, details);
                        await (0, metadata_1.writeFieldMetadata)(objectApi, fieldApi, xml);
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
                    const rows = await (await Promise.resolve().then(() => __importStar(require('./dependencies')))).readDependenciesCsv(path.join(depDir, f));
                    const details = await (0, salesforce_1.getFieldDetailsOrRetrieve)(objectApi, dependentField);
                    const xml = (0, metadata_1.buildDependentPicklistXml)(dependentField, controllingField, rows, details);
                    await (0, metadata_1.writeFieldMetadata)(objectApi, dependentField, xml);
                }
            }
            catch { }
            vscode.window.showInformationMessage('Métadonnées générées à partir des CSV.');
        }
        catch (err) {
            vscode.window.showErrorMessage(`Échec génération: ${err?.message || String(err)}`);
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
            vscode.window.showErrorMessage(`Échec préparation package: ${err?.message || String(err)}`);
        }
    });
    context.subscriptions.push(exportValues, importValues, exportDeps, importDeps, generateMetadata, prepareDeployment);
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