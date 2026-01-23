import * as fs from 'fs/promises';
import * as path from 'path';
import { create } from 'xmlbuilder2';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import { runSfdx, parseSfdxJson } from './sfdx';

export type PicklistEntry = { Label: string; APIName: string; IsActive: boolean };
export type FieldInfo = { objectApi: string; fieldApi: string; type: string; custom: boolean };
export type FieldDetails = FieldInfo & {
  label?: string;
  nillable?: boolean;
  inlineHelpText?: string;
  restrictedPicklist?: boolean;
  controllerName?: string;
};

export async function getDefaultUsername(): Promise<string | null> {
  try {
    const out = await runSfdx('sfdx force:org:list --json');
    const json = parseSfdxJson(out);
    const lists = [ ...(json?.result?.nonScratchOrgs || []), ...(json?.result?.scratchOrgs || []) ];
    const def = lists.find((o: any) => o.isDefaultUsername);
    return def?.username || null;
  } catch {
    return null;
  }
}

export async function getFieldInfo(objectApi: string, fieldApi: string): Promise<FieldInfo> {
  const username = await getDefaultUsername();
  const userArg = username ? ` -u "${username}"` : '';
  const out = await runSfdx(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
  const json = parseSfdxJson(out);
  if (json?.status && json?.status !== 0) {
    throw new Error(json?.message || 'Erreur describe');
  }
  const fields: any[] = json?.result?.fields || [];
  const f = fields.find(x => x.name === fieldApi);
  if (!f) throw new Error('Champ introuvable dans describe');
  return { objectApi, fieldApi, type: String(f.type || ''), custom: Boolean(f.custom) };
}

export async function getFieldDetails(objectApi: string, fieldApi: string): Promise<FieldDetails> {
  const username = await getDefaultUsername();
  const userArg = username ? ` -u "${username}"` : '';
  const out = await runSfdx(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
  const json = parseSfdxJson(out);
  if (json?.status && json?.status !== 0) {
    throw new Error(json?.message || 'Erreur describe');
  }
  const fields: any[] = json?.result?.fields || [];
  const f = fields.find(x => x.name === fieldApi);
  if (!f) throw new Error('Champ introuvable dans describe');
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

function defaultLabelFromField(fieldApi: string): string {
  return fieldApi
    .replace(/__c$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function readPicklistCsv(filePath: string): PicklistEntry[] {
  const content = require('fs').readFileSync(filePath, 'utf8');
  let records = parse(content, { columns: true, skip_empty_lines: true, delimiter: ';' });
  if (records.length > 0 && Object.keys(records[0]).length === 1) {
    try {
      records = parse(content, { columns: true, skip_empty_lines: true, delimiter: ',' });
    } catch {}
  }
  return records.map((r: any) => ({
    Label: String(r.Label ?? '').trim(),
    APIName: String(r.APIName ?? '').trim(),
    IsActive: (() => {
      const raw = r.IsActive;
      if (raw === undefined || raw === null || String(raw).trim() === '') {
        return true;
      }
      const v = String(raw).trim().toLowerCase();
      return v === 'true' || v === '1' || v === 'yes' || v === 'y';
    })()
  }));
}

export type DependencyRow = {
  ControllingField: string;
  DependentField: string;
  ControllingValue: string;
  DependentValues: string[];
};

export function readDependenciesCsv(filePath: string): DependencyRow[] {
  const content = require('fs').readFileSync(filePath, 'utf8');
  let records = parse(content, { columns: true, skip_empty_lines: true, delimiter: ';' });
  if (records.length > 0 && Object.keys(records[0]).length === 1) {
    try {
      records = parse(content, { columns: true, skip_empty_lines: true, delimiter: ',' });
    } catch {}
  }
  return records.map((r: any) => ({
    ControllingField: String(r.ControllingField ?? '').trim(),
    DependentField: String(r.DependentField ?? '').trim(),
    ControllingValue: String(r.ControllingValue ?? '').trim(),
    DependentValues: String(r.DependentValues ?? '').split(';').map((s: string) => s.trim()).filter(Boolean)
  }));
}

export function buildPicklistFieldXml(objectApi: string, fieldApi: string, entries: PicklistEntry[], details?: FieldDetails): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('CustomField', { xmlns: 'http://soap.sforce.com/2006/04/metadata' });
  root.ele('fullName').txt(fieldApi).up();
  const label = (details?.label && details.label.trim()) || defaultLabelFromField(fieldApi).trim() || fieldApi;
  root.ele('label').txt(label).up();
  const required = typeof details?.nillable === 'boolean' ? (!details.nillable) : false;
  root.ele('required').txt(required ? 'true' : 'false').up();
  const desc = details?.inlineHelpText || '';
  if (desc) root.ele('inlineHelpText').txt(desc).up();
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

export function buildGlobalValueSetXml(name: string, entries: PicklistEntry[]): string {
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
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

export function buildPicklistFieldGlobalRefXml(fieldApi: string, valueSetName: string, details?: FieldDetails): string {
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('CustomField', { xmlns: 'http://soap.sforce.com/2006/04/metadata' })
      .ele('fullName').txt(fieldApi).up();
  const label = (details?.label && details.label.trim()) || defaultLabelFromField(fieldApi).trim() || fieldApi;
  doc.ele('label').txt(label).up();
  const required = typeof details?.nillable === 'boolean' ? (!details.nillable) : false;
  doc.ele('required').txt(required ? 'true' : 'false').up();
  const desc = details?.inlineHelpText || '';
  if (desc) doc.ele('inlineHelpText').txt(desc).up();
  doc.ele('trackFeedHistory').txt('false').up();
  doc.ele('type').txt(/^multi/i.test(details?.type || '') ? 'MultiselectPicklist' : 'Picklist').up()
     .ele('valueSet')
       .ele('valueSetName').txt(valueSetName).up();
  const restricted = typeof details?.restrictedPicklist === 'boolean' ? details.restrictedPicklist : false;
  doc.ele('restricted').txt(restricted ? 'true' : 'false').up();
  doc.up();
  return doc.end({ prettyPrint: true });
}

export function buildDependentPicklistXml(dependentFieldApi: string, controllingFieldApi: string, rows: DependencyRow[], details?: FieldDetails): string {
  const childValues = Array.from(new Set(rows.flatMap(r => r.DependentValues)));
  const controlMap = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const dv of r.DependentValues) {
      const set = controlMap.get(dv) || new Set<string>();
      set.add(r.ControllingValue);
      controlMap.set(dv, set);
    }
  }
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('CustomField', { xmlns: 'http://soap.sforce.com/2006/04/metadata' });
  root.ele('fullName').txt(dependentFieldApi).up();
  const label = details?.label || defaultLabelFromField(dependentFieldApi);
  root.ele('label').txt(label).up();
  const required = typeof details?.nillable === 'boolean' ? (!details.nillable) : false;
  root.ele('required').txt(required ? 'true' : 'false').up();
  const desc = details?.inlineHelpText || '';
  if (desc) root.ele('inlineHelpText').txt(desc).up();
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

export function buildStandardValueSetXml(name: string, entries: PicklistEntry[]): string {
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
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

function rootDir(): string {
  return process.cwd();
}

export async function ensureFieldMetadataPath(objectApi: string, fieldApi: string): Promise<string> {
  const dir = path.join(rootDir(), 'DrPicklist', 'metadata', 'objects', objectApi, 'fields');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${fieldApi}.field-meta.xml`);
}

export async function writeFieldMetadata(objectApi: string, fieldApi: string, xml: string): Promise<string> {
  const filePath = await ensureFieldMetadataPath(objectApi, fieldApi);
  await fs.writeFile(filePath, xml, 'utf8');
  return filePath;
}

export async function ensureGlobalValueSetPath(name: string): Promise<string> {
  const dir = path.join(rootDir(), 'DrPicklist', 'metadata', 'globalValueSets');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${name}.globalValueSet`);
}

export async function writeGlobalValueSet(name: string, xml: string): Promise<string> {
  const filePath = await ensureGlobalValueSetPath(name);
  await fs.writeFile(filePath, xml, 'utf8');
  return filePath;
}

export async function ensureStandardValueSetPath(name: string): Promise<string> {
  const dir = path.join(rootDir(), 'DrPicklist', 'metadata', 'standardValueSets');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${name}.standardValueSet`);
}

export async function writeStandardValueSet(name: string, xml: string): Promise<string> {
  const filePath = await ensureStandardValueSetPath(name);
  await fs.writeFile(filePath, xml, 'utf8');
  return filePath;
}

export async function exportPicklistValuesDescribe(objectApi: string, fieldApi: string): Promise<PicklistEntry[]> {
  const username = await getDefaultUsername();
  const userArg = username ? ` -u "${username}"` : '';
  const out = await runSfdx(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
  const json = parseSfdxJson(out);
  if (json?.status && json?.status !== 0) {
    throw new Error(json?.message || 'Erreur describe');
  }
  const fields: any[] = json?.result?.fields || [];
  const f = fields.find(x => x.name === fieldApi);
  if (!f) return [];
  const pvs: any[] = f.picklistValues || [];
  return pvs.map(v => ({ Label: String(v.label || v.value || ''), APIName: String(v.value || ''), IsActive: Boolean(v.active) }));
}

export async function prepareDeploymentPackage(apiVersion = '59.0'): Promise<{ packageXml: string; copied: string[] }> {
  const root = rootDir();
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

export async function generateMetadataFromCsv(): Promise<void> {
  const root = rootDir();
  const pickDir = path.join(root, 'DrPicklist', 'csv', 'picklists');
  const depDir = path.join(root, 'DrPicklist', 'csv', 'dependencies');

  // Process picklists
  try {
    const files = await fs.readdir(pickDir);
    for (const f of files) {
      if (!f.endsWith('.csv')) continue;
      const localMatch = f.match(/^([^\.]+)\.([^\.]+)\.csv$/);
      if (localMatch) {
        const [ , objectApi, fieldApi ] = localMatch;
        const entries = readPicklistCsv(path.join(pickDir, f));
        const details = await getFieldDetails(objectApi, fieldApi).catch(() => undefined);
        const xml = buildPicklistFieldXml(objectApi, fieldApi, entries, details);
        await writeFieldMetadata(objectApi, fieldApi, xml);
        continue;
      }
      const gvsMatch = f.match(/^(.+)_Global\.csv$/);
      if (gvsMatch) {
        const [ , valueSetName ] = gvsMatch;
        const entries = readPicklistCsv(path.join(pickDir, f));
        const gxml = buildGlobalValueSetXml(valueSetName, entries);
        await writeGlobalValueSet(valueSetName, gxml);
        continue;
      }
      const svsMatch = f.match(/^(.+)_Standard\.csv$/);
      if (svsMatch) {
        const [ , valueSetName ] = svsMatch;
        const entries = readPicklistCsv(path.join(pickDir, f));
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
      const rows = readDependenciesCsv(path.join(depDir, f));
      const details = await getFieldDetails(objectApi, dependentField).catch(() => undefined);
      const xml = buildDependentPicklistXml(dependentField, controllingField, rows, details);
      await writeFieldMetadata(objectApi, dependentField, xml);
    }
  } catch {}
}

export async function exportDependenciesCli(objectApi: string, dependentField: string, controllingField?: string): Promise<string> {
  const username = await getDefaultUsername();
  const userArg = username ? ` -u "${username}"` : '';
  const out = await runSfdx(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
  const json = parseSfdxJson(out);
  const fields: any[] = json?.result?.fields || [];
  const dep = fields.find(f => f.name === dependentField);
  if (!dep) throw new Error('Champ dépendant introuvable');
  const ctrlName = controllingField || dep.controllerName;
  if (!ctrlName) throw new Error('Aucun champ de contrôle défini');
  const ctrl = fields.find(f => f.name === ctrlName);
  if (!ctrl) throw new Error('Champ de contrôle introuvable');
  const ctrlValues: string[] = (ctrl.picklistValues || []).map((v: any) => v.value);
  const depValues: { value: string; validFor?: string }[] = (dep.picklistValues || []).map((v: any) => ({ value: v.value, validFor: v.validFor }));
  function base64ToBits(b64: string): boolean[] {
    const buf = Buffer.from(b64, 'base64');
    const bits: boolean[] = [];
    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i];
      for (let bit = 0; bit < 8; bit++) {
        bits.push(((byte >> bit) & 1) === 1);
      }
    }
    return bits;
  }
  const rows = ctrlValues.map((cVal, ci) => {
    const allowed: string[] = [];
    for (const dv of depValues) {
      if (!dv.validFor) continue;
      const bits = base64ToBits(dv.validFor);
      if (bits[ci]) allowed.push(dv.value);
    }
    return { ControllingField: ctrlName, DependentField: dependentField, ControllingValue: cVal, DependentValues: allowed.join(';') };
  });
  const dir = path.join(rootDir(), 'DrPicklist', 'csv', 'dependencies');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${objectApi}.${ctrlName}__to__${dependentField}.csv`);
  const csv = stringify(rows, { header: true, columns: ['ControllingField','DependentField','ControllingValue','DependentValues'], delimiter: ';' });
  await fs.writeFile(filePath, csv, 'utf8');
  return filePath;
}
