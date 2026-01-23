export const workspace = {
  workspaceFolders: [
    {
      uri: { fsPath: process.cwd() }
    }
  ]
};

export const window = {
  showInformationMessage: (..._args: any[]) => undefined,
  showWarningMessage: (..._args: any[]) => undefined,
  showErrorMessage: (..._args: any[]) => undefined
};

export default { workspace, window };
