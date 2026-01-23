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
exports.exportPicklistValuesDescribe = exportPicklistValuesDescribe;
const child_process_1 = require("child_process");
const os = __importStar(require("os"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
function runSfdx(command) {
    return new Promise((resolve) => {
        (0, child_process_1.exec)(command, { shell: 'powershell.exe' }, (_error, stdout, stderr) => {
            const combined = `${stdout || ''}\n${stderr || ''}`;
            resolve(combined);
        });
    });
}
function stripAnsi(input) {
    // Remove ANSI color escape sequences
    return input.replace(/\u001b\[[0-9;]*m/g, '');
}
function parseSfdxJson(output) {
    const clean = stripAnsi(output);
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        throw new Error('Sortie SFDX non JSON: ' + clean.trim().slice(0, 500));
    }
    const jsonSlice = clean.slice(start, end + 1);
    return JSON.parse(jsonSlice);
}
function getWorkspaceRoot() {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws)
        throw new Error('Aucun workspace ouvert.');
    return ws.uri.fsPath;
}
async function exportPicklistValues(objectApi, fieldApi) {
    // Prefer CLI describe for reliability
    const viaDescribe = await exportPicklistValuesDescribe(objectApi, fieldApi);
    if (viaDescribe.length > 0)
        return viaDescribe;
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
        const out = await runSfdx(`sfdx force:apex:execute -f "${tmpFile}"${userArg} --json`);
        const json = parseSfdxJson(out);
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
    const username = await getDefaultUsername();
    const userArg = username ? ` -u "${username}"` : '';
    const out = await runSfdx(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
    const json = parseSfdxJson(out);
    if (json?.status && json?.status !== 0) {
        throw new Error(json?.message || 'Erreur describe');
    }
    const fields = json?.result?.fields || [];
    const f = fields.find(x => x.name === fieldApi);
    if (!f)
        throw new Error('Champ introuvable dans describe');
    return { objectApi, fieldApi, type: String(f.type || ''), custom: Boolean(f.custom) };
}
async function getFieldDetails(objectApi, fieldApi) {
    const username = await getDefaultUsername();
    const userArg = username ? ` -u "${username}"` : '';
    const out = await runSfdx(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
    const json = parseSfdxJson(out);
    if (json?.status && json?.status !== 0) {
        throw new Error(json?.message || 'Erreur describe');
    }
    const fields = json?.result?.fields || [];
    const f = fields.find(x => x.name === fieldApi);
    if (!f)
        throw new Error('Champ introuvable dans describe');
    return {
        objectApi,
        fieldApi,
        type: String(f.type || ''),
        custom: Boolean(f.custom),
        label: f.label,
        nillable: f.nillable,
        inlineHelpText: f.inlineHelpText,
        restrictedPicklist: f.restrictedPicklist,
        controllerName: f.controllerName,
    };
}
async function retrieveCustomObject(objectApi) {
    const username = await getDefaultUsername();
    const userArg = username ? ` -u "${username}"` : '';
    // Retrieve the CustomObject in source format into force-app/main/default
    const out = await runSfdx(`sfdx force:source:retrieve -m CustomObject:${objectApi}${userArg} --json`);
    const json = parseSfdxJson(out);
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
            controllerName: parseTextTag(content, 'controllerName') || parseTextTag(content, 'controllingField')
        };
    }
    catch {
        return null;
    }
}
async function getFieldDetailsOrRetrieve(objectApi, fieldApi) {
    try {
        return await getFieldDetails(objectApi, fieldApi);
    }
    catch { }
    try {
        const ok = await retrieveCustomObject(objectApi);
        if (!ok)
            return undefined;
        const fromLocal = await getFieldDetailsFromLocal(objectApi, fieldApi);
        return fromLocal ?? undefined;
    }
    catch {
        return undefined;
    }
}
async function getDefaultUsername() {
    try {
        const out = await runSfdx('sfdx force:org:list --json');
        const json = parseSfdxJson(out);
        const lists = [...(json?.result?.nonScratchOrgs || []), ...(json?.result?.scratchOrgs || [])];
        const def = lists.find((o) => o.isDefaultUsername);
        return def?.username || null;
    }
    catch {
        return null;
    }
}
async function exportPicklistValuesDescribe(objectApi, fieldApi) {
    const username = await getDefaultUsername();
    const userArg = username ? ` -u "${username}"` : '';
    const out = await runSfdx(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
    const json = parseSfdxJson(out);
    if (json?.status && json?.status !== 0) {
        throw new Error(json?.message || 'Erreur describe');
    }
    const fields = json?.result?.fields || [];
    const f = fields.find(x => x.name === fieldApi);
    if (!f)
        return [];
    const pvs = f.picklistValues || [];
    return pvs.map(v => ({ Label: String(v.label || v.value || ''), APIName: String(v.value || ''), IsActive: Boolean(v.active) }));
}
//# sourceMappingURL=salesforce.js.map