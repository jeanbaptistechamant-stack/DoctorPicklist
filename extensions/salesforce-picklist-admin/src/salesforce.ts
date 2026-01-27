import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { runSfdx, parseSfdxJson } from './sfdx';

export type PicklistEntry = { Label: string; APIName: string; IsActive: boolean };
export type FieldInfo = { objectApi: string; fieldApi: string; type: string; custom: boolean };
export type FieldDetails = FieldInfo & {
  label?: string;
  nillable?: boolean;
  inlineHelpText?: string;
  restrictedPicklist?: boolean;
  controllerName?: string;
  valueSetName?: string;
};

function getWorkspaceRoot(): string {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) throw new Error('Aucun workspace ouvert.');
  return ws.uri.fsPath;
}

export async function exportPicklistValues(objectApi: string, fieldApi: string): Promise<PicklistEntry[]> {
  // Utilise uniquement Apex pour éviter les erreurs de parsing JSON sur les gros objets
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
    const logs: string = json?.result?.logs || '';
    const lines = logs.split(/\r?\n/);
    const entries: PicklistEntry[] = [];
    let headerSeen = false;
    for (const line of lines) {
      const m = line.match(/USER_DEBUG\|\[\d+\]\|DEBUG\|(.*)/);
      if (!m) continue;
      const payload = m[1].trim();
      if (payload.startsWith('ERROR')) {
        throw new Error(payload);
      }
      if (payload === 'HEADER') { headerSeen = true; continue; }
      if (!headerSeen) continue; // ignore any pre-header debug
      const parts = payload.split(',');
      if (parts.length >= 3) {
        entries.push({ Label: parts[0], APIName: parts[1], IsActive: parts[2].toLowerCase() === 'true' });
      }
    }
    return entries;
  } finally {
    try { await fs.unlink(tmpFile); } catch {}
  }
}

export async function getFieldInfo(objectApi: string, fieldApi: string): Promise<FieldInfo> {
  // Utiliser uniquement les métadonnées locales pour éviter les erreurs describe
  const details = await getFieldDetailsFromLocal(objectApi, fieldApi);
  if (!details) {
    throw new Error(
      `Métadonnées pour ${objectApi}.${fieldApi} introuvables.\n` +
      `Veuillez d'abord récupérer les métadonnées localement :\n` +
      `sfdx force:source:retrieve -m CustomObject:${objectApi}`
    );
  }
  return {
    objectApi: details.objectApi,
    fieldApi: details.fieldApi,
    type: details.type,
    custom: details.custom
  };
}

export async function getFieldDetails(objectApi: string, fieldApi: string): Promise<FieldDetails> {
  // Utiliser uniquement les métadonnées locales
  const details = await getFieldDetailsFromLocal(objectApi, fieldApi);
  if (!details) {
    throw new Error(
      `Métadonnées pour ${objectApi}.${fieldApi} introuvables.\n` +
      `Veuillez d'abord récupérer les métadonnées localement :\n` +
      `sfdx force:source:retrieve -m CustomObject:${objectApi}`
    );
  }
  return details;
}

async function retrieveCustomObject(objectApi: string): Promise<boolean> {
  const username = await getDefaultUsername();
  const userArg = username ? ` -u "${username}"` : '';
  // Retrieve the CustomObject in source format into force-app/main/default
  const out = await runSfdx(`sfdx force:source:retrieve -m CustomObject:${objectApi}${userArg} --json`);
  const json = parseSfdxJson(out);
  if (json?.status && json?.status !== 0) return false;
  return true;
}

function parseBooleanTag(xml: string, tag: string): boolean | undefined {
  const m = xml.match(new RegExp(`<${tag}>\\s*(true|false)\\s*</${tag}>`, 'i'));
  if (!m) return undefined;
  return m[1].toLowerCase() === 'true';
}

function parseTextTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([\s\S]*?)</${tag}>`, 'i'));
  if (!m) return undefined;
  return m[1].trim();
}

async function getFieldDetailsFromLocal(objectApi: string, fieldApi: string): Promise<FieldDetails | null> {
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
      nillable: parseBooleanTag(content, 'required') === undefined ? undefined : !parseBooleanTag(content, 'required')!,
      inlineHelpText: parseTextTag(content, 'inlineHelpText') || parseTextTag(content, 'description'),
      restrictedPicklist: parseBooleanTag(content, 'restricted'),
      controllerName: parseTextTag(content, 'controllerName') || parseTextTag(content, 'controllingField'),
      valueSetName: parseTextTag(content, 'valueSetName')
    };
  } catch {
    return null;
  }
}

export async function getFieldDetailsOrRetrieve(objectApi: string, fieldApi: string): Promise<FieldDetails | undefined> {
  // Essayer d'abord depuis les métadonnées locales
  try {
    const fromLocal = await getFieldDetailsFromLocal(objectApi, fieldApi);
    if (fromLocal) return fromLocal;
  } catch {}
  
  // Si pas en local, tenter un retrieve
  try {
    const ok = await retrieveCustomObject(objectApi);
    if (ok) {
      const fromLocal = await getFieldDetailsFromLocal(objectApi, fieldApi);
      if (fromLocal) return fromLocal;
    }
  } catch {}
  
  // Si toujours rien, retourner undefined (l'appelant devra gérer)
  return undefined;
}

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


