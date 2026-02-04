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
exports.exportPicklistValues = exportPicklistValues;
exports.getFieldInfo = getFieldInfo;
exports.getFieldDetails = getFieldDetails;
exports.getFieldDetailsOrRetrieve = getFieldDetailsOrRetrieve;
exports.getDefaultUsername = getDefaultUsername;
const os = __importStar(require("os"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const sfdx_1 = require("./sfdx");
function getWorkspaceRoot() {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws)
        throw new Error('Aucun workspace ouvert.');
    return ws.uri.fsPath;
}
async function exportPicklistValues(objectApi, fieldApi) {
    // Utilise uniquement Apex pour éviter les erreurs de parsing JSON sur les gros objets
    const apex = `
String objectApi = '${objectApi}';
String fieldApi = '${fieldApi}';
Schema.SObjectType objType = Schema.getGlobalDescribe().get(objectApi);
if (objType == null) {
  System.debug('ERROR,Object not found');
} else {
  Schema.DescribeSObjectResult objDescribe = objType.getDescribe();
  Map<String, Schema.SObjectField> fieldMap = objDescribe.fields.getMap();
  Schema.SObjectField fld = fieldMap.get(fieldApi);
  if (fld == null) {
    System.debug('ERROR,Field not found');
  } else {
    Schema.DescribeFieldResult fieldDescribe = fld.getDescribe();
    List<Schema.PicklistEntry> entries = fieldDescribe.getPicklistValues();
    System.debug('HEADER');
    for (Schema.PicklistEntry e : entries) {
      System.debug(e.getLabel() + ',' + e.getValue() + ',' + String.valueOf(e.isActive()));
    }
  }
}`;
    const tmpFile = path.join(os.tmpdir(), `drpicklist_${Date.now()}.apex`);
    await fs.writeFile(tmpFile, apex, 'utf8');
    try {
        const username = await getDefaultUsername();
        const userArg = username ? ` -u "${username}"` : '';
        const out = await (0, sfdx_1.runSfdx)(`sf force:apex:execute -f "${tmpFile}"${userArg} --json`);
        const json = (0, sfdx_1.parseSfdxJson)(out);
        const logs = json?.result?.logs || '';
        const lines = logs.split(/\r?\n/);
        const entries = [];
        let headerSeen = false;
        for (const line of lines) {
            const m = line.match(/USER_DEBUG\|\[\d+\]\|DEBUG\|(.*)/);
            if (!m)
                continue;
            const payload = m[1].trim();
            if (payload.startsWith('ERROR')) {
                throw new Error(payload);
            }
            if (payload === 'HEADER') {
                headerSeen = true;
                continue;
            }
            if (!headerSeen)
                continue; // ignore any pre-header debug
            const parts = payload.split(',');
            if (parts.length >= 3) {
                entries.push({ Label: parts[0], APIName: parts[1], IsActive: parts[2].toLowerCase() === 'true' });
            }
        }
        return entries;
    }
    finally {
        try {
            await fs.unlink(tmpFile);
        }
        catch { }
    }
}
async function getFieldInfo(objectApi, fieldApi) {
    // Utiliser uniquement les métadonnées locales pour éviter les erreurs describe
    const details = await getFieldDetailsFromLocal(objectApi, fieldApi);
    if (!details) {
        throw new Error(`Métadonnées pour ${objectApi}.${fieldApi} introuvables.\n` +
            `Veuillez d'abord récupérer les métadonnées localement :\n` +
            `sf force:source:retrieve -m CustomObject:${objectApi}`);
    }
    return {
        objectApi: details.objectApi,
        fieldApi: details.fieldApi,
        type: details.type,
        custom: details.custom
    };
}
async function getFieldDetails(objectApi, fieldApi) {
    // Utiliser uniquement les métadonnées locales
    const details = await getFieldDetailsFromLocal(objectApi, fieldApi);
    if (!details) {
        throw new Error(`Métadonnées pour ${objectApi}.${fieldApi} introuvables.\n` +
            `Veuillez d'abord récupérer les métadonnées localement :\n` +
            `sf force:source:retrieve -m CustomObject:${objectApi}`);
    }
    return details;
}
async function retrieveCustomObject(objectApi) {
    const username = await getDefaultUsername();
    const userArg = username ? ` -u "${username}"` : '';
    // Retrieve the CustomObject in source format into force-app/main/default
    const out = await (0, sfdx_1.runSfdx)(`sf force:source:retrieve -m CustomObject:${objectApi}${userArg} --json`);
    const json = (0, sfdx_1.parseSfdxJson)(out);
    if (json?.status && json?.status !== 0)
        return false;
    return true;
}
function parseBooleanTag(xml, tag) {
    const m = xml.match(new RegExp(`<${tag}>\\s*(true|false)\\s*</${tag}>`, 'i'));
    if (!m)
        return undefined;
    return m[1].toLowerCase() === 'true';
}
function parseTextTag(xml, tag) {
    const m = xml.match(new RegExp(`<${tag}>([\s\S]*?)</${tag}>`, 'i'));
    if (!m)
        return undefined;
    return m[1].trim();
}
async function getFieldDetailsFromLocal(objectApi, fieldApi) {
    const root = getWorkspaceRoot();
    const filePath = path.join(root, 'force-app', 'main', 'default', 'objects', objectApi, 'fields', `${fieldApi}.field-meta.xml`);
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const typeText = parseTextTag(content, 'type') || '';
        return {
            objectApi,
            fieldApi,
            type: typeText,
            custom: /__c$/i.test(fieldApi),
            label: parseTextTag(content, 'label'),
            nillable: parseBooleanTag(content, 'required') === undefined ? undefined : !parseBooleanTag(content, 'required'),
            inlineHelpText: parseTextTag(content, 'inlineHelpText') || parseTextTag(content, 'description'),
            restrictedPicklist: parseBooleanTag(content, 'restricted'),
            controllerName: parseTextTag(content, 'controllerName') || parseTextTag(content, 'controllingField'),
            valueSetName: parseTextTag(content, 'valueSetName')
        };
    }
    catch {
        return null;
    }
}
async function getFieldDetailsOrRetrieve(objectApi, fieldApi) {
    // Essayer d'abord depuis les métadonnées locales
    try {
        const fromLocal = await getFieldDetailsFromLocal(objectApi, fieldApi);
        if (fromLocal)
            return fromLocal;
    }
    catch { }
    // Si pas en local, tenter un retrieve
    try {
        const ok = await retrieveCustomObject(objectApi);
        if (ok) {
            const fromLocal = await getFieldDetailsFromLocal(objectApi, fieldApi);
            if (fromLocal)
                return fromLocal;
        }
    }
    catch { }
    // Si toujours rien, retourner undefined (l'appelant devra gérer)
    return undefined;
}
async function getDefaultUsername() {
    try {
        const out = await (0, sfdx_1.runSfdx)('sf force:org:list --json');
        const json = (0, sfdx_1.parseSfdxJson)(out);
        const lists = [...(json?.result?.nonScratchOrgs || []), ...(json?.result?.scratchOrgs || [])];
        const def = lists.find((o) => o.isDefaultUsername);
        return def?.username || null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=salesforce.js.map