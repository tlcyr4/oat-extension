import { commands, window, ExtensionContext } from 'vscode';

export function activate(context: ExtensionContext) {
    console.log("Hello,W0rld!");
    let disposable = commands.registerCommand('extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		window.showInformationMessage('Hello World!');
	});

	context.subscriptions.push(disposable);
}