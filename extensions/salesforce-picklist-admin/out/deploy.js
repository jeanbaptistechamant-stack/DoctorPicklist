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
exports.prepareDeploymentPackage = prepareDeploymentPackage;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const xmlbuilder2_1 = require("xmlbuilder2");
function getWorkspaceRoot() {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws)
        throw new Error('Aucun workspace ouvert.');
    return ws.uri.fsPath;
}
async function prepareDeploymentPackage(apiVersion = '59.0') {
    const root = getWorkspaceRoot();
    const metaRoot = path.join(root, 'DrPicklist', 'metadata');
    const deploySrc = path.join(root, 'DrPicklist', 'deploy', 'src');
    await fs.mkdir(deploySrc, { recursive: true });
    const types = {
        CustomObject: [],
        GlobalValueSet: [],
        StandardValueSet: []
    };
    const copyList = [];
    // CustomObject fields
    const objectsDir = path.join(metaRoot, 'objects');
    try {
        const objFiles = await fs.readdir(objectsDir);
        const outDir = path.join(deploySrc, 'objects');
        await fs.mkdir(outDir, { recursive: true });
        for (const f of objFiles) {
            if (!f.endsWith('.object'))
                continue;
            const name = f.replace(/\.object$/, '');
            types.CustomObject.push(name);
            const src = path.join(objectsDir, f);
            const dst = path.join(outDir, f);
            await fs.copyFile(src, dst);
            copyList.push(dst);
        }
    }
    catch { }
    // GlobalValueSet
    const gvsDir = path.join(metaRoot, 'globalValueSets');
    try {
        const gFiles = await fs.readdir(gvsDir);
        const outDir = path.join(deploySrc, 'globalValueSets');
        await fs.mkdir(outDir, { recursive: true });
        for (const f of gFiles) {
            if (!f.endsWith('.globalValueSet'))
                continue;
            const name = f.replace(/\.globalValueSet$/, '');
            types.GlobalValueSet.push(name);
            const src = path.join(gvsDir, f);
            const dst = path.join(outDir, f);
            await fs.copyFile(src, dst);
            copyList.push(dst);
        }
    }
    catch { }
    // StandardValueSet
    const svsDir = path.join(metaRoot, 'standardValueSets');
    try {
        const sFiles = await fs.readdir(svsDir);
        const outDir = path.join(deploySrc, 'standardValueSets');
        await fs.mkdir(outDir, { recursive: true });
        for (const f of sFiles) {
            if (!f.endsWith('.standardValueSet'))
                continue;
            const name = f.replace(/\.standardValueSet$/, '');
            types.StandardValueSet.push(name);
            const src = path.join(svsDir, f);
            const dst = path.join(outDir, f);
            await fs.copyFile(src, dst);
            copyList.push(dst);
        }
    }
    catch { }
    // Build package.xml
    const pkgDoc = (0, xmlbuilder2_1.create)({ version: '1.0', encoding: 'UTF-8' })
        .ele('Package', { xmlns: 'http://soap.sforce.com/2006/04/metadata' });
    for (const [typeName, members] of Object.entries(types)) {
        if (!members || members.length === 0)
            continue;
        const t = pkgDoc.ele('types');
        for (const m of members) {
            t.ele('members').txt(m).up();
        }
        t.ele('name').txt(typeName).up();
    }
    pkgDoc.ele('version').txt(apiVersion).up();
    const packageXml = pkgDoc.end({ prettyPrint: true });
    const pkgPath = path.join(root, 'DrPicklist', 'deploy', 'package.xml');
    await fs.writeFile(pkgPath, packageXml, 'utf8');
    return { packageXml: pkgPath, copied: copyList };
}
//# sourceMappingURL=deploy.js.map