import { parseSfdxJson } from '../sfdx';

describe('parseSfdxJson', () => {
  it('ignore warnings and parses main JSON block', () => {
    const sample = `
warning: something noisy
info: irrelevant line
{ "status": 0, "result": { "foo": 1 } }
`;
    const parsed = parseSfdxJson(sample);
    expect(parsed.result.foo).toBe(1);
  });

  it('handles leading/trailing noise and balanced braces', () => {
    const sample = `
==== progress 1/2 ====
Output line { not json }
{ "status": 0, "result": { "items": [1, 2, 3] } }
Trailing line with text
`;
    const parsed = parseSfdxJson(sample);
    expect(parsed.result.items).toEqual([1, 2, 3]);
  });
});
