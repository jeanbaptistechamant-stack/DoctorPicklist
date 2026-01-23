import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import type { PicklistEntry } from './salesforce';

export async function ensurePicklistCsvPath(objectApi: string, fieldApi: string): Promise<string> {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) throw new Error('Aucun workspace ouvert.');
  const dir = path.join(ws.uri.fsPath, 'DrPicklist', 'csv', 'picklists');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${objectApi}.${fieldApi}.csv`);
}

export async function writePicklistCsv(filePath: string, entries: PicklistEntry[]) {
  const records = entries.map(e => ({ Label: e.Label, APIName: e.APIName, IsActive: e.IsActive }));
  const csv = stringify(records, { header: true, columns: ['Label', 'APIName', 'IsActive'], delimiter: ';' });
  await fs.writeFile(filePath, csv, 'utf8');
}

export async function readPicklistCsv(filePath: string): Promise<PicklistEntry[]> {
  const content = await fs.readFile(filePath, 'utf8');
  // Try semicolon first, then fallback to comma for legacy CSVs
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
        return true; // default to true when unspecified
      }
      const v = String(raw).trim().toLowerCase();
      return v === 'true' || v === '1' || v === 'yes' || v === 'y';
    })()
  }));
}
