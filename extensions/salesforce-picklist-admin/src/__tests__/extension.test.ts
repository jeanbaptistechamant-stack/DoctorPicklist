import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ensureDrPicklistScaffolding } from '../extension';

describe('DrPicklist scaffolding', () => {
  it('crée toute la structure DrPicklist dans un répertoire donné', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'drpicklist_init_'));
    await ensureDrPicklistScaffolding(tmpRoot);

    const expectedDirs = [
      'DrPicklist',
      path.join('DrPicklist', 'csv'),
      path.join('DrPicklist', 'csv', 'picklists'),
      path.join('DrPicklist', 'csv', 'dependencies'),
      path.join('DrPicklist', 'metadata'),
      path.join('DrPicklist', 'metadata', 'objects'),
      path.join('DrPicklist', 'metadata', 'globalValueSets'),
      path.join('DrPicklist', 'metadata', 'standardValueSets'),
      path.join('DrPicklist', 'deploy'),
    ];

    for (const rel of expectedDirs) {
      const full = path.join(tmpRoot, rel);
      const stat = await fs.stat(full);
      expect(stat.isDirectory()).toBe(true);
    }
  });
});
