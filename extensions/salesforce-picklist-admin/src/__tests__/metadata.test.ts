import { buildPicklistFieldXml, buildGlobalValueSetXml, buildStandardValueSetXml, buildDependentPicklistXml } from '../metadata';
import type { DependencyRow } from '../dependencies';

describe('metadata builders', () => {
  it('builds local picklist field xml', () => {
    const xml = buildPicklistFieldXml('Account', 'MyPick__c', [
      { Label: 'A', APIName: 'A', IsActive: true },
      { Label: 'B', APIName: 'B', IsActive: false },
    ]);
    expect(xml).toContain('<CustomField');
    expect(xml).toContain('<fullName>MyPick__c</fullName>');
    expect(xml).toContain('<valueSetDefinition>');
    expect(xml).toContain('<fullName>A</fullName>');
    expect(xml).toContain('<restricted>');
  });

  it('builds global value set xml', () => {
    const xml = buildGlobalValueSetXml('Industry_Global', [
      { Label: 'Manufacturing', APIName: 'Manufacturing', IsActive: true },
    ]);
    expect(xml).toContain('<GlobalValueSet');
    expect(xml).toContain('<masterLabel>Industry_Global</masterLabel>');
  });

  it('builds standard value set xml', () => {
    const xml = buildStandardValueSetXml('Industry', [
      { Label: 'Manufacturing', APIName: 'Manufacturing', IsActive: true },
    ]);
    expect(xml).toContain('<StandardValueSet');
    expect(xml).toContain('<standardValue>');
  });

  it('builds dependent picklist mapping with multiple controlling values', () => {
    const rows: DependencyRow[] = [
      { ControllingField: 'Country__c', DependentField: 'State__c', ControllingValue: 'USA', DependentValues: ['CA','TX'] },
      { ControllingField: 'Country__c', DependentField: 'State__c', ControllingValue: 'Canada', DependentValues: ['QC','ON'] },
      { ControllingField: 'Country__c', DependentField: 'State__c', ControllingValue: 'USA', DependentValues: ['NY'] },
    ];
    const xml = buildDependentPicklistXml('State__c', 'Country__c', rows);
    expect(xml).toContain('<controllingField>Country__c</controllingField>');
    expect(xml).toContain('<controllerName>Country__c</controllerName>');
    // Each dependent value appears with valueSettings and multiple controllingFieldValues across rows
    expect(xml).toContain('<valueName>CA</valueName>');
    expect(xml).toContain('<valueName>NY</valueName>');
  });
});
