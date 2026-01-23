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
exports.ensurePicklistCsvPath = ensurePicklistCsvPath;
exports.writePicklistCsv = writePicklistCsv;
exports.readPicklistCsv = readPicklistCsv;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const sync_1 = require("csv-stringify/sync");
const sync_2 = require("csv-parse/sync");
async function ensurePicklistCsvPath(objectApi, fieldApi) {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws)
        throw new Error('Aucun workspace ouvert.');
    const dir = path.join(ws.uri.fsPath, 'DrPicklist', 'csv', 'picklists');
    await fs.mkdir(dir, { recursive: true });
    return path.join(dir, `${objectApi}.${fieldApi}.csv`);
}
async function writePicklistCsv(filePath, entries) {
    const records = entries.map(e => ({ Label: e.Label, APIName: e.APIName, IsActive: e.IsActive }));
    const csv = (0, sync_1.stringify)(records, { header: true, columns: ['Label', 'APIName', 'IsActive'], delimiter: ';' });
    await fs.writeFile(filePath, csv, 'utf8');
}
async function readPicklistCsv(filePath) {
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
        Label: String(r.Label ?? '').trim(),
        APIName: String(r.APIName ?? '').trim(),
        IsActive: (() => {
            const raw = r.IsActive;
            if (raw === undefined || raw === null || String(raw).trim() === '') {
                return true; // default to true when unspecified
            }
            const v = String(raw).trim().toLowerCase();
            return v === 'true' || v === '1' || v === 'yes' || v === 'y';
        })()
    }));
}
//# sourceMappingURL=csv.js.map