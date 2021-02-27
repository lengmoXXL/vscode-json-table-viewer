// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { JSONTable } from './jsonTable';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('json-table-viewer.OpenView', () => {
			let activeTextEditor = vscode.window.activeTextEditor;
			if (activeTextEditor) {
				try {
					let json = new JSONTable(activeTextEditor.document.getText());

					const panel = vscode.window.createWebviewPanel(
						'json-table-viewer',
						'JSON Table Viewer',
						vscode.ViewColumn.One,
						{}
					);

					panel.webview.html = json.getHTML();
					// console.log(json.getHTML());
				} catch (e) {
					vscode.window.showErrorMessage(e.toString());
				}
			}
		})
	);
}

// this method is called when your extension is deactivated
export function deactivate() {}
