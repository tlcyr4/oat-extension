/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
// license put back because MIT License seems to say that's the one rule
 import {
	createConnection,
	TextDocuments,
	TextDocument,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	Position,
} from 'vscode-languageserver';

// import {tmpNameSync} from 'tmp';
// import {writeFileSync} from 'fs';
declare interface compiler_pos {
	line : number;
	char : number;
}
declare interface compiler_range {
	start: compiler_pos;
	finish : compiler_pos;
}
const compiler = require('./compiler');

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

connection.onInitialize((params: InitializeParams) => {
	return {
		capabilities: {
			textDocumentSync: documents.syncKind
		}
	};
});

connection.onDidChangeConfiguration(change => {
	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// console.log("server validate");

	let errors : Array<compiler_range> = compiler.compile([textDocument.getText()]);
	let diagnostics: Diagnostic[] = errors.map(
		function (error : compiler_range):Diagnostic {
			let start = error.start;
			let end = error.finish;
			let diagnostic:Diagnostic = {
				severity:DiagnosticSeverity.Error,
				range: {
					// line numbers need to be shifted to 0-index
					start: Position.create(start.line-1, start.char),
					end: Position.create(end.line-1, end.char)
				},
				message: 'Syntax Error',
				source: 'Oat Intellisense'
			}
			return diagnostic;
		}
	);

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}


// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
