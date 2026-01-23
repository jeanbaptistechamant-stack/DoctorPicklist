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
exports.ensureFieldMetadataPath = ensureFieldMetadataPath;
exports.buildPicklistFieldXml = buildPicklistFieldXml;
exports.writeFieldMetadata = writeFieldMetadata;
exports.ensureGlobalValueSetPath = ensureGlobalValueSetPath;
exports.buildGlobalValueSetXml = buildGlobalValueSetXml;
exports.writeGlobalValueSet = writeGlobalValueSet;
exports.buildPicklistFieldGlobalRefXml = buildPicklistFieldGlobalRefXml;
exports.buildDependentPicklistXml = buildDependentPicklistXml;
exports.ensureStandardValueSetPath = ensureStandardValueSetPath;
exports.buildStandardValueSetXml = buildStandardValueSetXml;
exports.writeStandardValueSet = writeStandardValueSet;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const xmlbuilder2_1 = require("xmlbuilder2");
function defaultLabelFromField(fieldApi) {
    return fieldApi
        .replace(/__c$/i, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, (m) => m.toUpperCase());
}
async function ensureFieldMetadataPath(objectApi, fieldApi) {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws)
        throw new Error('Aucun workspace ouvert.');
    const dir = path.join(ws.uri.fsPath, 'DrPicklist', 'metadata', 'objects', objectApi, 'fields');
    await fs.mkdir(dir, { recursive: true });
    return path.join(dir, `${fieldApi}.field-meta.xml`);
}
function buildPicklistFieldXml(objectApi, fieldApi, entries, details) {
    const root = (0, xmlbuilder2_1.create)({ version: '1.0', encoding: 'UTF-8' }).ele('CustomField', { xmlns: 'http://soap.sforce.com/2006/04/metadata' });
    root.ele('fullName').txt(fieldApi).up();
    const label = (details?.label && details.label.trim()) || defaultLabelFromField(fieldApi).trim() || fieldApi;
    root.ele('label').txt(label).up();
    const required = typeof details?.nillable === 'boolean' ? (!details.nillable) : false;
    root.ele('required').txt(required ? 'true' : 'false').up();
    const desc = details?.inlineHelpText || '';
    if (desc)
        root.ele('inlineHelpText').txt(desc).up();
    root.ele('trackFeedHistory').txt('false').up();
    root.ele('type').txt(/^multi/i.test(details?.type || '') ? 'MultiselectPicklist' : 'Picklist').up();
    const vs = root.ele('valueSet');
    const vsd = vs.ele('valueSetDefinition');
    vsd.ele('sorted').txt('false').up();
    for (const e of entries) {
        const v = vsd.ele('value');
        v.ele('fullName').txt(e.APIName).up();
        v.ele('default').txt('false').up();
        v.ele('label').txt(e.Label || e.APIName).up();
        v.ele('isActive').txt(e.IsActive ? 'true' : 'false').up();
    }
    const restricted = typeof details?.restrictedPicklist === 'boolean' ? details.restrictedPicklist : false;
    vs.ele('restricted').txt(restricted ? 'true' : 'false').up();
    return root.end({ prettyPrint: true });
}
async function writeFieldMetadata(objectApi, fieldApi, xml) {
    const filePath = await ensureFieldMetadataPath(objectApi, fieldApi);
    await fs.writeFile(filePath, xml, 'utf8');
    return filePath;
}
async function ensureGlobalValueSetPath(name) {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws)
        throw new Error('Aucun workspace ouvert.');
    const dir = path.join(ws.uri.fsPath, 'DrPicklist', 'metadata', 'globalValueSets');
    await fs.mkdir(dir, { recursive: true });
    return path.join(dir, `${name}.globalValueSet`);
}
function buildGlobalValueSetXml(name, entries) {
    const doc = (0, xmlbuilder2_1.create)({ version: '1.0', encoding: 'UTF-8' })
        .ele('GlobalValueSet', { xmlns: 'http://soap.sforce.com/2006/04/metadata' })
        .ele('masterLabel').txt(name).up()
        .ele('sorted').txt('false').up();
    for (const e of entries) {
        doc.ele('customValue')
            .ele('fullName').txt(e.APIName).up()
            .ele('default').txt('false').up()
            .ele('label').txt(e.Label || e.APIName).up()
            .ele('isActive').txt(e.IsActive ? 'true' : 'false').up()
            .up();
    }
    return doc.end({ prettyPrint: true });
}
async function writeGlobalValueSet(name, xml) {
    const filePath = await ensureGlobalValueSetPath(name);
    await fs.writeFile(filePath, xml, 'utf8');
    return filePath;
}
function buildPicklistFieldGlobalRefXml(fieldApi, valueSetName, details) {
    const doc = (0, xmlbuilder2_1.create)({ version: '1.0', encoding: 'UTF-8' })
        .ele('CustomField', { xmlns: 'http://soap.sforce.com/2006/04/metadata' })
        .ele('fullName').txt(fieldApi).up();
    const label = (details?.label && details.label.trim()) || defaultLabelFromField(fieldApi).trim() || fieldApi;
    doc.ele('label').txt(label).up();
    const required = typeof details?.nillable === 'boolean' ? (!details.nillable) : false;
    doc.ele('required').txt(required ? 'true' : 'false').up();
    const desc = details?.inlineHelpText || '';
    if (desc)
        doc.ele('inlineHelpText').txt(desc).up();
    doc.ele('trackFeedHistory').txt('false').up();
    doc.ele('type').txt(/^multi/i.test(details?.type || '') ? 'MultiselectPicklist' : 'Picklist').up()
        .ele('valueSet')
        .ele('valueSetName').txt(valueSetName).up();
    const restricted = typeof details?.restrictedPicklist === 'boolean' ? details.restrictedPicklist : false;
    doc.ele('restricted').txt(restricted ? 'true' : 'false').up();
    doc.up();
    return doc.end({ prettyPrint: true });
}
function buildDependentPicklistXml(dependentFieldApi, controllingFieldApi, rows, details) {
    const childValues = Array.from(new Set(rows.flatMap(r => r.DependentValues)));
    const controlMap = new Map();
    for (const r of rows) {
        for (const dv of r.DependentValues) {
            const set = controlMap.get(dv) || new Set();
            set.add(r.ControllingValue);
            controlMap.set(dv, set);
        }
    }
    const root = (0, xmlbuilder2_1.create)({ version: '1.0', encoding: 'UTF-8' }).ele('CustomField', { xmlns: 'http://soap.sforce.com/2006/04/metadata' });
    root.ele('fullName').txt(dependentFieldApi).up();
    const label = details?.label || defaultLabelFromField(dependentFieldApi);
    root.ele('label').txt(label).up();
    const required = typeof details?.nillable === 'boolean' ? (!details.nillable) : false;
    root.ele('required').txt(required ? 'true' : 'false').up();
    const desc = details?.inlineHelpText || '';
    if (desc)
        root.ele('inlineHelpText').txt(desc).up();
    root.ele('trackFeedHistory').txt('false').up();
    root.ele('type').txt('Picklist').up();
    const vs = root.ele('valueSet');
    vs.ele('controllingField').txt(controllingFieldApi).up();
    const vsd = vs.ele('valueSetDefinition');
    vsd.ele('sorted').txt('false').up();
    for (const v of childValues) {
        const val = vsd.ele('value');
        val.ele('fullName').txt(v).up();
        val.ele('default').txt('false').up();
        val.ele('label').txt(v).up();
        val.ele('isActive').txt('true').up();
    }
    for (const [dv, set] of controlMap.entries()) {
        const vsSettings = vs.ele('valueSettings');
        vsSettings.ele('valueName').txt(dv).up();
        for (const cv of Array.from(set)) {
            vsSettings.ele('controllingFieldValues').txt(cv).up();
        }
    }
    const restricted = typeof details?.restrictedPicklist === 'boolean' ? details.restrictedPicklist : false;
    vs.ele('restricted').txt(restricted ? 'true' : 'false').up();
    root.ele('controllerName').txt(controllingFieldApi).up();
    return root.end({ prettyPrint: true });
}
async function ensureStandardValueSetPath(name) {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws)
        throw new Error('Aucun workspace ouvert.');
    const dir = path.join(ws.uri.fsPath, 'DrPicklist', 'metadata', 'standardValueSets');
    await fs.mkdir(dir, { recursive: true });
    return path.join(dir, `${name}.standardValueSet`);
}
function buildStandardValueSetXml(name, entries) {
    const doc = (0, xmlbuilder2_1.create)({ version: '1.0', encoding: 'UTF-8' })
        .ele('StandardValueSet', { xmlns: 'http://soap.sforce.com/2006/04/metadata' })
        .ele('sorted').txt('false').up();
    for (const e of entries) {
        doc.ele('standardValue')
            .ele('fullName').txt(e.APIName).up()
            .ele('default').txt('false').up()
            .ele('label').txt(e.Label || e.APIName).up()
            .up();
    }
    return doc.end({ prettyPrint: true });
}
async function writeStandardValueSet(name, xml) {
    const filePath = await ensureStandardValueSetPath(name);
    await fs.writeFile(filePath, xml, 'utf8');
    return filePath;
}
//# sourceMappingURL=metadata.js.map