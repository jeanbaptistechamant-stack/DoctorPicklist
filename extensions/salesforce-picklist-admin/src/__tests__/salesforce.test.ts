import * as child_process from 'child_process';
import { exportPicklistValuesDescribe, getDefaultUsername } from '../salesforce';

jest.mock('child_process', () => ({ exec: jest.fn() }));

function mockExecOutputs(outputs: any[]) {
  outputs.forEach(out => {
    (child_process.exec as unknown as jest.Mock).mockImplementationOnce((cmd: string, opts: any, cb: any) => {
      cb(null, JSON.stringify(out), '');
    });
  });
}

describe('salesforce describe helpers', () => {
  beforeEach(() => {
    (child_process.exec as unknown as jest.Mock).mockReset();
  });

  it('parses picklist values from sobject describe', async () => {
    // First call: org list (no default username), second: sobject describe
    mockExecOutputs([
      { result: { nonScratchOrgs: [], scratchOrgs: [] } },
      { result: { fields: [ { name: 'Industry', picklistValues: [ { label: 'A', value: 'A', active: true } ] } ] } }
    ]);
    const values = await exportPicklistValuesDescribe('Account', 'Industry');
    expect(values).toEqual([{ Label: 'A', APIName: 'A', IsActive: true }]);
  });

  it('finds default username from org list', async () => {
    mockExecOutputs([
      { result: { nonScratchOrgs: [ { username: 'test@example.com', isDefaultUsername: true } ], scratchOrgs: [] } }
    ]);
    const def = await getDefaultUsername();
    expect(def).toBe('test@example.com');
  });
});
