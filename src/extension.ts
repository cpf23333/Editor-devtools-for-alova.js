import * as vscode from 'vscode';
import { generateApiCommand } from './commands/generateApi';

let myStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  // generateApiCommand();
  context.subscriptions.push(generateApiCommand());

  // create a new status bar item that we can now manage
  const myCommandId = 'alova.start';
  myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  myStatusBarItem.command = myCommandId;
  context.subscriptions.push(myStatusBarItem);

  // register some listener that make sure the status bar
  // item always up-to-date
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBarItem));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(updateStatusBarItem));

  // update status bar item once at start
  updateStatusBarItem();
}

function updateStatusBarItem(): void {
  myStatusBarItem.text = `$(alova-icon-id) can be refresh`;
  myStatusBarItem.show();
}
