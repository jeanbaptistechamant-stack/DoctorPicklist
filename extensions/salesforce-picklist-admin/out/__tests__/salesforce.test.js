"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const child_process = __importStar(require("child_process"));
const salesforce_1 = require("../salesforce");
jest.mock('child_process', () => ({ exec: jest.fn() }));
function mockExecOnce(output) {
    child_process.exec.mockImplementationOnce((cmd, opts, cb) => {
        cb(null, JSON.stringify(output), '');
    });
}
describe('salesforce describe helpers', () => {
    beforeEach(() => {
        child_process.exec.mockReset();
    });
    it('parses picklist values from sobject describe', async () => {
        mockExecOnce({ result: { fields: [{ name: 'Industry', picklistValues: [{ label: 'A', value: 'A', active: true }] }] } });
        const values = await (0, salesforce_1.exportPicklistValuesDescribe)('Account', 'Industry');
        expect(values).toEqual([{ Label: 'A', APIName: 'A', IsActive: true }]);
    });
    it('finds default username from org list', async () => {
        mockExecOnce({ result: { nonScratchOrgs: [{ username: 'test@example.com', isDefaultUsername: true }], scratchOrgs: [] } });
        const def = await (0, salesforce_1.getDefaultUsername)();
        expect(def).toBe('test@example.com');
    });
});
//# sourceMappingURL=salesforce.test.js.map