import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { create } from 'xmlbuilder2';
import type { PicklistEntry, FieldDetails } from './salesforce';

function defaultLabelFromField(fieldApi: string): string {
  return fieldApi
    .replace(/__c$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
import type { DependencyRow } from './dependencies';

export async function ensureFieldMetadataPath(objectApi: string, fieldApi: string): Promise<string> {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) throw new Error('Aucun workspace ouvert.');
  const dir = path.join(ws.uri.fsPath, 'DrPicklist', 'metadata', 'objects', objectApi, 'fields');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${fieldApi}.field-meta.xml`);
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

export async function writeFieldMetadata(objectApi: string, fieldApi: string, xml: string): Promise<string> {
  const filePath = await ensureFieldMetadataPath(objectApi, fieldApi);
  await fs.writeFile(filePath, xml, 'utf8');
  return filePath;
}

export async function ensureGlobalValueSetPath(name: string): Promise<string> {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) throw new Error('Aucun workspace ouvert.');
  const dir = path.join(ws.uri.fsPath, 'DrPicklist', 'metadata', 'globalValueSets');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${name}.globalValueSet`);
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

export async function writeGlobalValueSet(name: string, xml: string): Promise<string> {
  const filePath = await ensureGlobalValueSetPath(name);
  await fs.writeFile(filePath, xml, 'utf8');
  return filePath;
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

export async function ensureStandardValueSetPath(name: string): Promise<string> {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) throw new Error('Aucun workspace ouvert.');
  const dir = path.join(ws.uri.fsPath, 'DrPicklist', 'metadata', 'standardValueSets');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${name}.standardValueSet`);
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

export async function writeStandardValueSet(name: string, xml: string): Promise<string> {
  const filePath = await ensureStandardValueSetPath(name);
  await fs.writeFile(filePath, xml, 'utf8');
  return filePath;
}
