/**
 * VS Code extension — unit tests.
 * vscode API is mocked via __mocks__/vscode.js.
 * No VS Code instance or Electron required.
 */

// Jest picks up __mocks__/vscode.js automatically when moduleNameMapper maps "vscode"
import * as vscode from "vscode";
import { activate, deactivate } from "../extension";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    extensionPath: "/mock/extension",
    extensionUri: vscode.Uri.file("/mock/extension"),
    globalState: { get: jest.fn(), update: jest.fn(), keys: jest.fn().mockReturnValue([]) } as any,
    workspaceState: { get: jest.fn(), update: jest.fn(), keys: jest.fn().mockReturnValue([]) } as any,
    secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn() } as any,
    environmentVariableCollection: {} as any,
    storageUri: vscode.Uri.file("/mock/storage"),
    globalStorageUri: vscode.Uri.file("/mock/global"),
    logUri: vscode.Uri.file("/mock/log"),
    extensionMode: 3,
    storagePath: "/mock/storage",
    globalStoragePath: "/mock/global",
    logPath: "/mock/log",
    asAbsolutePath: (p: string) => `/mock/extension/${p}`,
    extension: {} as any,
  } as unknown as vscode.ExtensionContext;
}

// Reset all mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});

// ─── activate ─────────────────────────────────────────────────────────────────

describe("activate", () => {
  test("creates a status bar item", () => {
    const ctx = makeContext();
    activate(ctx);
    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
      vscode.StatusBarAlignment.Left,
      100,
    );
  });

  test("status bar item is shown", () => {
    const ctx = makeContext();
    activate(ctx);
    const statusBar = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;
    expect(statusBar.show).toHaveBeenCalled();
  });

  test("status bar command points to showDashboard", () => {
    const ctx = makeContext();
    activate(ctx);
    const statusBar = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;
    expect(statusBar.command).toBe("shinydapps.showDashboard");
  });

  test("registers WebviewViewProvider for shinydapps.payments", () => {
    const ctx = makeContext();
    activate(ctx);
    expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
      "shinydapps.payments",
      expect.anything(),
    );
  });

  test("registers shinydapps.showDashboard command", () => {
    const ctx = makeContext();
    activate(ctx);
    const registeredCommands = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(c => c[0]);
    expect(registeredCommands).toContain("shinydapps.showDashboard");
  });

  test("registers shinydapps.configure command", () => {
    const ctx = makeContext();
    activate(ctx);
    const registeredCommands = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(c => c[0]);
    expect(registeredCommands).toContain("shinydapps.configure");
  });

  test("pushes all disposables to context.subscriptions", () => {
    const ctx = makeContext();
    activate(ctx);
    expect(ctx.subscriptions.length).toBeGreaterThanOrEqual(3);
  });

  test("does not throw when lightningAddress is not configured", () => {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue(""),
      update: jest.fn(),
    });
    const ctx = makeContext();
    expect(() => activate(ctx)).not.toThrow();
  });
});

// ─── deactivate ───────────────────────────────────────────────────────────────

describe("deactivate", () => {
  test("does not throw when called without prior activate", () => {
    expect(() => deactivate()).not.toThrow();
  });

  test("does not throw after activate has been called", () => {
    activate(makeContext());
    expect(() => deactivate()).not.toThrow();
  });
});

// ─── shinydapps.configure command ─────────────────────────────────────────────

describe("shinydapps.configure command", () => {
  test("updates configuration when user provides an address", async () => {
    const ctx = makeContext();
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue(""),
      update: mockUpdate,
    });
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue("dev@blink.sv");

    activate(ctx);

    // Find the configure command handler
    const calls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
    const configureCall = calls.find(c => c[0] === "shinydapps.configure");
    expect(configureCall).toBeDefined();

    await configureCall![1]();

    expect(mockUpdate).toHaveBeenCalledWith("lightningAddress", "dev@blink.sv", true);
  });

  test("shows confirmation message after configuring address", async () => {
    const ctx = makeContext();
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue(""),
      update: jest.fn().mockResolvedValue(undefined),
    });
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue("dev@blink.sv");

    activate(ctx);

    const calls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
    const configureCall = calls.find(c => c[0] === "shinydapps.configure");
    await configureCall![1]();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("dev@blink.sv"),
    );
  });

  test("does nothing when user cancels input box", async () => {
    const ctx = makeContext();
    const mockUpdate = jest.fn();
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue(""),
      update: mockUpdate,
    });
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

    activate(ctx);

    const calls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
    const configureCall = calls.find(c => c[0] === "shinydapps.configure");
    await configureCall![1]();

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
