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
exports.ensureDependenciesCsvPath = ensureDependenciesCsvPath;
exports.writeDependenciesCsv = writeDependenciesCsv;
exports.readDependenciesCsv = readDependenciesCsv;
exports.exportDependencies = exportDependencies;
exports.listPicklistFields = listPicklistFields;
exports.exportDependenciesWithController = exportDependenciesWithController;
const salesforce_1 = require("./salesforce");
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const sync_1 = require("csv-stringify/sync");
const sync_2 = require("csv-parse/sync");
const sfdx_1 = require("./sfdx");
function getWorkspaceRoot() {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws)
        throw new Error('Aucun workspace ouvert.');
    return ws.uri.fsPath;
}
async function ensureDependenciesCsvPath(objectApi, controllingField, dependentField) {
    const dir = path.join(getWorkspaceRoot(), 'DrPicklist', 'csv', 'dependencies');
    await fs.mkdir(dir, { recursive: true });
    return path.join(dir, `${objectApi}.${controllingField}__to__${dependentField}.csv`);
}
async function writeDependenciesCsv(filePath, rows) {
    const records = rows.map(r => ({
        ControllingField: r.ControllingField,
        DependentField: r.DependentField,
        ControllingValue: r.ControllingValue,
        DependentValues: r.DependentValues.join(';')
    }));
    const csv = (0, sync_1.stringify)(records, { header: true, columns: ['ControllingField', 'DependentField', 'ControllingValue', 'DependentValues'], delimiter: ';' });
    await fs.writeFile(filePath, csv, 'utf8');
}
async function readDependenciesCsv(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    // Try semicolon first, then fallback to comma for legacy CSVs
    let records = (0, sync_2.parse)(content, { columns: true, skip_empty_lines: true, delimiter: ';' });
    if (records.length > 0 && Object.keys(records[0]).length === 1) {
        try {
            records = (0, sync_2.parse)(content, { columns: true, skip_empty_lines: true, delimiter: ',' });
        }
        catch { }
    }
    return records.map((r) => ({
        ControllingField: String(r.ControllingField ?? '').trim(),
        DependentField: String(r.DependentField ?? '').trim(),
        ControllingValue: String(r.ControllingValue ?? '').trim(),
        DependentValues: String(r.DependentValues ?? '').split(';').map((s) => s.trim()).filter(Boolean)
    }));
}
function base64ToBits(b64) {
    const buf = Buffer.from(b64, 'base64');
    const bits = [];
    for (let i = 0; i < buf.length; i++) {
        const byte = buf[i];
        for (let bit = 0; bit < 8; bit++) {
            bits.push(((byte >> bit) & 1) === 1);
        }
    }
    return bits;
}
async function exportDependencies(objectApi, dependentField) {
    const username = await (0, salesforce_1.getDefaultUsername)();
    const userArg = username ? ` -u "${username}"` : '';
    const out = await (0, sfdx_1.runSfdx)(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
    const json = (0, sfdx_1.parseSfdxJson)(out);
    if (json?.status && json.status !== 0) {
        throw new Error(json?.message || 'Erreur describe');
    }
    const fields = json?.result?.fields || [];
    const dep = fields.find(f => f.name === dependentField);
    if (!dep)
        throw new Error('Champ dépendant introuvable');
    const controllingField = dep.controllerName;
    if (!controllingField)
        throw new Error('Aucun champ de contrôle défini');
    const ctrl = fields.find(f => f.name === controllingField);
    if (!ctrl)
        throw new Error('Champ de contrôle introuvable');
    const ctrlValues = (ctrl.picklistValues || []).map((v) => v.value);
    const depValues = (dep.picklistValues || []).map((v) => ({ value: v.value, validFor: v.validFor }));
    const rows = [];
    for (let ci = 0; ci < ctrlValues.length; ci++) {
        const cVal = ctrlValues[ci];
        const allowed = [];
        for (const dv of depValues) {
            if (!dv.validFor)
                continue;
            const bits = base64ToBits(dv.validFor);
            if (bits[ci]) {
                allowed.push(dv.value);
            }
        }
        rows.push({ ControllingField: controllingField, DependentField: dependentField, ControllingValue: cVal, DependentValues: allowed });
    }
    const filePath = await ensureDependenciesCsvPath(objectApi, controllingField, dependentField);
    await writeDependenciesCsv(filePath, rows);
    return filePath;
}
async function listPicklistFields(objectApi) {
    const username = await (0, salesforce_1.getDefaultUsername)();
    const userArg = username ? ` -u "${username}"` : '';
    const out = await (0, sfdx_1.runSfdx)(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
    const json = (0, sfdx_1.parseSfdxJson)(out);
    if (json?.status && json.status !== 0) {
        throw new Error(json?.message || 'Erreur describe');
    }
    const fields = json?.result?.fields || [];
    return fields.filter(f => String(f.type).toLowerCase() === 'picklist').map(f => String(f.name));
}
async function exportDependenciesWithController(objectApi, dependentField, controllingField) {
    const username = await (0, salesforce_1.getDefaultUsername)();
    const userArg = username ? ` -u "${username}"` : '';
    const out = await (0, sfdx_1.runSfdx)(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
    const json = (0, sfdx_1.parseSfdxJson)(out);
    if (json?.status && json.status !== 0) {
        throw new Error(json?.message || 'Erreur describe');
    }
    const fields = json?.result?.fields || [];
    const dep = fields.find(f => f.name === dependentField);
    if (!dep)
        throw new Error('Champ dépendant introuvable');
    const ctrl = fields.find(f => f.name === controllingField);
    if (!ctrl)
        throw new Error('Champ de contrôle introuvable');
    const ctrlValues = (ctrl.picklistValues || []).map((v) => v.value);
    const depValues = (dep.picklistValues || []).map((v) => ({ value: v.value, validFor: v.validFor }));
    const rows = [];
    for (let ci = 0; ci < ctrlValues.length; ci++) {
        const cVal = ctrlValues[ci];
        const allowed = [];
        for (const dv of depValues) {
            if (!dv.validFor)
                continue;
            const bits = base64ToBits(dv.validFor);
            if (bits[ci]) {
                allowed.push(dv.value);
            }
        }
        rows.push({ ControllingField: controllingField, DependentField: dependentField, ControllingValue: cVal, DependentValues: allowed });
    }
    const filePath = await ensureDependenciesCsvPath(objectApi, controllingField, dependentField);
    await writeDependenciesCsv(filePath, rows);
    return filePath;
}
//# sourceMappingURL=dependencies.js.map