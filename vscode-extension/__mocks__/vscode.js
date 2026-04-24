// Mock for the 'vscode' module — used in Jest tests.
// The real vscode API is only available inside a VS Code extension host.

const EventEmitter = jest.fn().mockImplementation(() => ({
  event: jest.fn(),
  fire: jest.fn(),
  dispose: jest.fn(),
}));

const window = {
  registerWebviewViewProvider: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  createWebviewPanel: jest.fn().mockReturnValue({
    webview: { html: "", onDidReceiveMessage: jest.fn(), postMessage: jest.fn(), cspSource: "" },
    onDidDispose: jest.fn(),
    reveal: jest.fn(),
    dispose: jest.fn(),
  }),
  createStatusBarItem: jest.fn().mockReturnValue({
    text: "",
    tooltip: "",
    command: "",
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  }),
  showInputBox: jest.fn().mockResolvedValue(undefined),
  showInformationMessage: jest.fn().mockResolvedValue(undefined),
  showWarningMessage: jest.fn().mockResolvedValue(undefined),
  showErrorMessage: jest.fn().mockResolvedValue(undefined),
  showQuickPick: jest.fn().mockResolvedValue(undefined),
};

const commands = {
  registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  executeCommand: jest.fn().mockResolvedValue(undefined),
};

const workspace = {
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn().mockReturnValue(""),
    update: jest.fn().mockResolvedValue(undefined),
    has: jest.fn().mockReturnValue(false),
    inspect: jest.fn(),
  }),
  onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() }),
};

const Uri = {
  file: jest.fn((p) => ({ fsPath: p, toString: () => `file://${p}` })),
  parse: jest.fn((s) => ({ toString: () => s })),
  joinPath: jest.fn((_base, ...parts) => ({ toString: () => parts.join("/"), fsPath: parts.join("/") })),
};

const StatusBarAlignment = { Left: 1, Right: 2 };
const ViewColumn = { One: 1, Two: 2, Three: 3, Active: -1, Beside: -2 };
const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };

const ExtensionContext = {};

module.exports = {
  EventEmitter,
  window,
  commands,
  workspace,
  Uri,
  StatusBarAlignment,
  ViewColumn,
  ConfigurationTarget,
  ExtensionContext,
};
