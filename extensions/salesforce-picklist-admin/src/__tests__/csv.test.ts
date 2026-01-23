import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { writePicklistCsv, readPicklistCsv } from '../csv';
import type { PicklistEntry } from '../salesforce';

describe('csv helpers', () => {
  it('writes and reads picklist CSV', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'drpicklist_csv_'));
    const file = path.join(tmp, 'Test.csv');
    const entries: PicklistEntry[] = [
      { Label: 'One', APIName: 'One', IsActive: true },
      { Label: 'Two', APIName: 'Two', IsActive: false },
    ];
    await writePicklistCsv(file, entries);
    const back = await readPicklistCsv(file);
    expect(back).toHaveLength(2);
    expect(back[0]).toEqual(entries[0]);
  });
});
