"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.window = exports.workspace = void 0;
exports.workspace = {
    workspaceFolders: [
        {
            uri: { fsPath: process.cwd() }
        }
    ]
};
exports.window = {
    showInformationMessage: (..._args) => undefined,
    showWarningMessage: (..._args) => undefined,
    showErrorMessage: (..._args) => undefined
};
exports.default = { workspace: exports.workspace, window: exports.window };
//# sourceMappingURL=vscode.js.map