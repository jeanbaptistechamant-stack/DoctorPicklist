"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const metadata_1 = require("../metadata");
describe('metadata builders', () => {
    it('builds local picklist field xml', () => {
        const xml = (0, metadata_1.buildPicklistFieldXml)('Account', 'MyPick__c', [
            { Label: 'A', APIName: 'A', IsActive: true },
            { Label: 'B', APIName: 'B', IsActive: false },
        ]);
        expect(xml).toContain('<CustomObject');
        expect(xml).toContain('<fields>');
        expect(xml).toContain('<fullName>MyPick__c</fullName>');
        expect(xml).toContain('<valueSetDefinition>');
        expect(xml).toContain('<fullName>A</fullName>');
    });
    it('builds global value set xml', () => {
        const xml = (0, metadata_1.buildGlobalValueSetXml)('Industry_Global', [
            { Label: 'Manufacturing', APIName: 'Manufacturing', IsActive: true },
        ]);
        expect(xml).toContain('<GlobalValueSet');
        expect(xml).toContain('<masterLabel>Industry_Global</masterLabel>');
    });
    it('builds standard value set xml', () => {
        const xml = (0, metadata_1.buildStandardValueSetXml)('Industry', [
            { Label: 'Manufacturing', APIName: 'Manufacturing', IsActive: true },
        ]);
        expect(xml).toContain('<StandardValueSet');
        expect(xml).toContain('<standardValue>');
    });
    it('builds dependent picklist mapping with multiple controlling values', () => {
        const rows = [
            { ControllingField: 'Country__c', DependentField: 'State__c', ControllingValue: 'USA', DependentValues: ['CA', 'TX'] },
            { ControllingField: 'Country__c', DependentField: 'State__c', ControllingValue: 'Canada', DependentValues: ['QC', 'ON'] },
            { ControllingField: 'Country__c', DependentField: 'State__c', ControllingValue: 'USA', DependentValues: ['NY'] },
        ];
        const xml = (0, metadata_1.buildDependentPicklistXml)('State__c', 'Country__c', rows);
        expect(xml).toContain('<controllingField>Country__c</controllingField>');
        // Each dependent value appears with valueSettings and multiple controllingFieldValues across rows
        expect(xml).toContain('<valueName>CA</valueName>');
        expect(xml).toContain('<valueName>NY</valueName>');
    });
});
//# sourceMappingURL=metadata.test.js.map