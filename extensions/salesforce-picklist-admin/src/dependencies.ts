import { getDefaultUsername } from './salesforce';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import { runSfdx, parseSfdxJson } from './sfdx';

function getWorkspaceRoot(): string {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) throw new Error('Aucun workspace ouvert.');
  return ws.uri.fsPath;
}

export type DependencyRow = {
  ControllingField: string;
  DependentField: string;
  ControllingValue: string;
  DependentValues: string[];
};

export async function ensureDependenciesCsvPath(objectApi: string, controllingField: string, dependentField: string): Promise<string> {
  const dir = path.join(getWorkspaceRoot(), 'DrPicklist', 'csv', 'dependencies');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${objectApi}.${controllingField}__to__${dependentField}.csv`);
}

export async function writeDependenciesCsv(filePath: string, rows: DependencyRow[]) {
  const records = rows.map(r => ({
    ControllingField: r.ControllingField,
    DependentField: r.DependentField,
    ControllingValue: r.ControllingValue,
    DependentValues: r.DependentValues.join(';')
  }));
  const csv = stringify(records, { header: true, columns: ['ControllingField','DependentField','ControllingValue','DependentValues'], delimiter: ';' });
  await fs.writeFile(filePath, csv, 'utf8');
}

export async function readDependenciesCsv(filePath: string): Promise<DependencyRow[]> {
  const content = await fs.readFile(filePath, 'utf8');
  // Try semicolon first, then fallback to comma for legacy CSVs
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

export async function exportDependencies(objectApi: string, dependentField: string) {
  const username = await getDefaultUsername();
  const userArg = username ? ` -u "${username}"` : '';
  const out = await runSfdx(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
  const json = parseSfdxJson(out);
  if (json?.status && json.status !== 0) {
    throw new Error(json?.message || 'Erreur describe');
  }
  const fields: any[] = json?.result?.fields || [];
  const dep = fields.find(f => f.name === dependentField);
  if (!dep) throw new Error('Champ dépendant introuvable');
  const controllingField: string = dep.controllerName;
  if (!controllingField) throw new Error('Aucun champ de contrôle défini');
  const ctrl = fields.find(f => f.name === controllingField);
  if (!ctrl) throw new Error('Champ de contrôle introuvable');

  const ctrlValues: string[] = (ctrl.picklistValues || []).map((v: any) => v.value);
  const depValues: { value: string; validFor?: string }[] = (dep.picklistValues || []).map((v: any) => ({ value: v.value, validFor: v.validFor }));

  const rows: DependencyRow[] = [];
  for (let ci = 0; ci < ctrlValues.length; ci++) {
    const cVal = ctrlValues[ci];
    const allowed: string[] = [];
    for (const dv of depValues) {
      if (!dv.validFor) continue;
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

export async function listPicklistFields(objectApi: string): Promise<string[]> {
  const username = await getDefaultUsername();
  const userArg = username ? ` -u "${username}"` : '';
  const out = await runSfdx(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
  const json = parseSfdxJson(out);
  if (json?.status && json.status !== 0) {
    throw new Error(json?.message || 'Erreur describe');
  }
  const fields: any[] = json?.result?.fields || [];
  return fields.filter(f => String(f.type).toLowerCase() === 'picklist').map(f => String(f.name));
}

export async function exportDependenciesWithController(objectApi: string, dependentField: string, controllingField: string) {
  const username = await getDefaultUsername();
  const userArg = username ? ` -u "${username}"` : '';
  const out = await runSfdx(`sfdx force:schema:sobject:describe -s ${objectApi}${userArg} --json`);
  const json = parseSfdxJson(out);
  if (json?.status && json.status !== 0) {
    throw new Error(json?.message || 'Erreur describe');
  }
  const fields: any[] = json?.result?.fields || [];
  const dep = fields.find(f => f.name === dependentField);
  if (!dep) throw new Error('Champ dépendant introuvable');
  const ctrl = fields.find(f => f.name === controllingField);
  if (!ctrl) throw new Error('Champ de contrôle introuvable');

  const ctrlValues: string[] = (ctrl.picklistValues || []).map((v: any) => v.value);
  const depValues: { value: string; validFor?: string }[] = (dep.picklistValues || []).map((v: any) => ({ value: v.value, validFor: v.validFor }));

  const rows: DependencyRow[] = [];
  for (let ci = 0; ci < ctrlValues.length; ci++) {
    const cVal = ctrlValues[ci];
    const allowed: string[] = [];
    for (const dv of depValues) {
      if (!dv.validFor) continue;
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
