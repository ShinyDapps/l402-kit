import * as vscode from "vscode";
import { DashboardPanel } from "./dashboard";

export function activate(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand("l402-dashboard.show", () => {
    DashboardPanel.createOrShow(context.extensionUri);
  });

  context.subscriptions.push(cmd);
}

export function deactivate() {}
