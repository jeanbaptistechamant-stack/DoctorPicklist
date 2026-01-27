#!/usr/bin/env node
import { Command } from 'commander';
import { generateMetadataFromCsv, prepareDeploymentPackage, exportPicklistValuesDescribe, readPicklistCsv, buildPicklistFieldXml, writeFieldMetadata, buildGlobalValueSetXml, writeGlobalValueSet, buildStandardValueSetXml, writeStandardValueSet, getFieldDetails, readDependenciesCsv, buildDependentPicklistXml, buildPicklistFieldGlobalRefXml, exportDependenciesCli } from './cli_core';
import * as path from 'path';
import * as fs from 'fs/promises';

async function writeCliErrorLog(context: string, err: any): Promise<string | null> {
  try {
    const logDir = path.join(process.cwd(), 'DrPicklist', 'logs');
    await fs.mkdir(logDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(logDir, `${context}-${timestamp}.log`);
    const message = [
      `Contexte: ${context}`,
      `Date: ${new Date().toISOString()}`,
      '',
      String(err?.stack || err?.message || err || '')
    ].join('\n');
    await fs.writeFile(filePath, message, 'utf8');
    return filePath;
  } catch {
    return null;
  }
}

const program = new Command();
program
  .name('dr-picklist')
  .description('CLI pour générer et gérer les picklists Salesforce depuis CSV')
  .version('0.1.0');

program.command('generate')
  .description('Générer toutes les métadonnées depuis DrPicklist/csv')
  .action(async () => {
    try {
      await generateMetadataFromCsv();
      console.log('Métadonnées générées à partir des CSV.');
    } catch (err: any) {
      const logPath = await writeCliErrorLog('cli-generate', err);
      console.error('Échec génération:', err?.message || String(err));
      if (logPath) {
        console.error('Voir log:', logPath);
      }
      process.exit(1);
    }
  });

program.command('prepare-deploy')
  .description('Préparer le package MDAPI (DrPicklist/deploy)')
  .option('-a, --api <version>', 'Version API', '59.0')
  .action(async (opts: any) => {
    try {
      const { packageXml, copied } = await prepareDeploymentPackage(opts.api);
      console.log('Package prêt:', packageXml);
      console.log('Fichiers copiés:', copied.length);
    } catch (err: any) {
      const logPath = await writeCliErrorLog('cli-prepare-deploy', err);
      console.error('Échec préparation package:', err?.message || String(err));
      if (logPath) {
        console.error('Voir log:', logPath);
      }
      process.exit(1);
    }
  });

program.command('export-values')
  .description('Exporter une picklist vers CSV')
  .requiredOption('-o, --object <api>', 'Objet API (ex: Account)')
  .requiredOption('-f, --field <api>', 'Champ API (ex: Industry)')
  .action(async (opts: any) => {
    try {
      const entries = await exportPicklistValuesDescribe(opts.object, opts.field);
      const filePath = path.join(process.cwd(), 'DrPicklist', 'csv', 'picklists', `${opts.object}.${opts.field}.csv`);
      const records = entries.map(e => ({ Label: e.Label, APIName: e.APIName, IsActive: e.IsActive }));
      const { stringify } = await import('csv-stringify/sync');
      const csv = stringify(records, { header: true, columns: ['Label','APIName','IsActive'], delimiter: ';' });
      await (await import('fs/promises')).writeFile(filePath, csv, 'utf8');
      console.log('Exporté:', filePath);
    } catch (err: any) {
      const logPath = await writeCliErrorLog('cli-export-values', err);
      console.error('Échec export:', err?.message || String(err));
      if (logPath) {
        console.error('Voir log:', logPath);
      }
      process.exit(1);
    }
  });

program.command('import-values')
  .description('Importer des valeurs depuis CSV et générer XML')
  .requiredOption('--csv <path>', 'Chemin du CSV')
  .requiredOption('-m, --mode <mode>', 'Mode: local|global|standard')
  .option('-o, --object <api>', 'Objet API (ex: Account)')
  .option('-f, --field <api>', 'Champ API (ex: Industry)')
  .option('--valueset <name>', 'Nom du GlobalValueSet (si mode=global)')
  .action(async (opts: any) => {
    try {
      const entries = readPicklistCsv(path.resolve(opts.csv));
      if (entries.length === 0) throw new Error('CSV vide ou invalide');
      const base = path.basename(opts.csv);
      let objectApi = opts.object || '';
      let fieldApi = opts.field || '';
      const m = base.match(/^([^\.]+)\.([^\.]+)\.csv$/);
      if (m) { objectApi ||= m[1]; fieldApi ||= m[2]; }

      const mode = String(opts.mode).toLowerCase();
      if (mode === 'local') {
        if (!objectApi || !fieldApi) throw new Error('Objet/Champ requis');
        const details = await getFieldDetails(objectApi, fieldApi).catch(() => undefined);
        const xml = buildPicklistFieldXml(objectApi, fieldApi, entries, details);
        const outPath = await writeFieldMetadata(objectApi, fieldApi, xml);
        console.log('XML champ (local) généré:', outPath);
      } else if (mode === 'global') {
        if (!objectApi || !fieldApi) throw new Error('Objet/Champ requis');
        const valueSetName = opts.valueset || `${objectApi}_${fieldApi}_GVS`;
        const gxml = buildGlobalValueSetXml(valueSetName, entries);
        const gOut = await writeGlobalValueSet(valueSetName, gxml);
        const details = await getFieldDetails(objectApi, fieldApi).catch(() => undefined);
        const fxml = buildPicklistFieldGlobalRefXml(fieldApi, valueSetName, details);
        const fOut = await writeFieldMetadata(objectApi, fieldApi, fxml);
        console.log('GlobalValueSet généré:', gOut);
        console.log('Champ référencé au GlobalValueSet:', fOut);
      } else if (mode === 'standard') {
        const valueSetName = fieldApi || 'Industry';
        const sxml = buildStandardValueSetXml(valueSetName, entries);
        const sOut = await writeStandardValueSet(valueSetName, sxml);
        console.log('StandardValueSet généré:', sOut);
      } else {
        throw new Error('Mode invalide: utilisez local|global|standard');
      }
    } catch (err: any) {
      const logPath = await writeCliErrorLog('cli-import-values', err);
      console.error('Échec import XML:', err?.message || String(err));
      if (logPath) {
        console.error('Voir log:', logPath);
      }
      process.exit(1);
    }
  });

program.command('export-dependencies')
  .description('Exporter les dépendances (parent -> enfant) vers CSV')
  .requiredOption('-o, --object <api>', 'Objet API (ex: Account)')
  .requiredOption('-d, --dependent <api>', 'Champ dépendant (ex: State__c)')
  .option('-c, --controlling <api>', 'Champ de contrôle (ex: Country__c)')
  .action(async (opts: any) => {
    try {
      const filePath = await exportDependenciesCli(opts.object, opts.dependent, opts.controlling);
      console.log('Dépendances exportées:', filePath);
    } catch (err: any) {
      const logPath = await writeCliErrorLog('cli-export-dependencies', err);
      console.error('Échec export dépendances:', err?.message || String(err));
      if (logPath) {
        console.error('Voir log:', logPath);
      }
      process.exit(1);
    }
  });

program.command('import-dependencies')
  .description('Importer un CSV de dépendances et générer le XML du champ dépendant')
  .requiredOption('--csv <path>', 'Chemin du CSV de dépendances')
  .requiredOption('-o, --object <api>', 'Objet API (ex: Account)')
  .requiredOption('-c, --controlling <api>', 'Champ de contrôle')
  .requiredOption('-d, --dependent <api>', 'Champ dépendant')
  .action(async (opts: any) => {
    try {
      const rows = readDependenciesCsv(path.resolve(opts.csv));
      const details = await getFieldDetails(opts.object, opts.dependent).catch(() => undefined);
      const xml = buildDependentPicklistXml(opts.dependent, opts.controlling, rows, details);
      const outPath = await writeFieldMetadata(opts.object, opts.dependent, xml);
      console.log('XML dépendances généré:', outPath);
    } catch (err: any) {
      const logPath = await writeCliErrorLog('cli-import-dependencies', err);
      console.error('Échec import dépendances:', err?.message || String(err));
      if (logPath) {
        console.error('Voir log:', logPath);
      }
      process.exit(1);
    }
  });

program.parseAsync();
