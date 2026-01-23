import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { create } from 'xmlbuilder2';

function getWorkspaceRoot(): string {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) throw new Error('Aucun workspace ouvert.');
  return ws.uri.fsPath;
}

export async function prepareDeploymentPackage(apiVersion = '59.0'): Promise<{ packageXml: string; copied: string[] }> {
  const root = getWorkspaceRoot();
  const metaRoot = path.join(root, 'DrPicklist', 'metadata');
  const deploySrc = path.join(root, 'DrPicklist', 'deploy', 'src');
  await fs.mkdir(deploySrc, { recursive: true });

  const types: Record<string, string[]> = {
    CustomObject: [],
    GlobalValueSet: [],
    StandardValueSet: []
  };

  const copyList: string[] = [];

  // CustomObject fields
  const objectsDir = path.join(metaRoot, 'objects');
  try {
    const objFiles = await fs.readdir(objectsDir);
    const outDir = path.join(deploySrc, 'objects');
    await fs.mkdir(outDir, { recursive: true });
    for (const f of objFiles) {
      if (!f.endsWith('.object')) continue;
      const name = f.replace(/\.object$/, '');
      types.CustomObject.push(name);
      const src = path.join(objectsDir, f);
      const dst = path.join(outDir, f);
      await fs.copyFile(src, dst);
      copyList.push(dst);
    }
  } catch {}

  // GlobalValueSet
  const gvsDir = path.join(metaRoot, 'globalValueSets');
  try {
    const gFiles = await fs.readdir(gvsDir);
    const outDir = path.join(deploySrc, 'globalValueSets');
    await fs.mkdir(outDir, { recursive: true });
    for (const f of gFiles) {
      if (!f.endsWith('.globalValueSet')) continue;
      const name = f.replace(/\.globalValueSet$/, '');
      types.GlobalValueSet.push(name);
      const src = path.join(gvsDir, f);
      const dst = path.join(outDir, f);
      await fs.copyFile(src, dst);
      copyList.push(dst);
    }
  } catch {}

  // StandardValueSet
  const svsDir = path.join(metaRoot, 'standardValueSets');
  try {
    const sFiles = await fs.readdir(svsDir);
    const outDir = path.join(deploySrc, 'standardValueSets');
    await fs.mkdir(outDir, { recursive: true });
    for (const f of sFiles) {
      if (!f.endsWith('.standardValueSet')) continue;
      const name = f.replace(/\.standardValueSet$/, '');
      types.StandardValueSet.push(name);
      const src = path.join(svsDir, f);
      const dst = path.join(outDir, f);
      await fs.copyFile(src, dst);
      copyList.push(dst);
    }
  } catch {}

  // Build package.xml
  const pkgDoc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Package', { xmlns: 'http://soap.sforce.com/2006/04/metadata' });

  for (const [typeName, members] of Object.entries(types)) {
    if (!members || members.length === 0) continue;
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
