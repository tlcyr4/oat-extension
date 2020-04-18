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
	DidChangeConfigurationNotification,
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
declare interface compiler_error {
	message : string;
	location : compiler_range;
}

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

const compiler_v1 = require('./oat-compiler-v1');
const compiler_v2 = require('./oat-compiler-v2');

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we will fall back using global settings
	hasConfigurationCapability =
		!!capabilities.workspace && (!!(capabilities.workspace.configuration));
	hasWorkspaceFolderCapability =
		!!capabilities.workspace && !!capabilities.workspace.workspaceFolders;
	hasDiagnosticRelatedInformationCapability =
    	!!capabilities.textDocument &&
    	!!capabilities.textDocument.publishDiagnostics &&
		!!capabilities.textDocument.publishDiagnostics.relatedInformation;
	
	return {
		capabilities: {
			textDocumentSync: documents.syncKind
		}
	};
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
	  // Register for all configuration changes.
	  connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
	  connection.workspace.onDidChangeWorkspaceFolders(_event => {
		connection.console.log('Workspace folder change event received.');
	  });
	}
  });

interface OatSettings {
	compiler: {
		version :number;
	};
}
const defaultSettings: OatSettings = { compiler: {version: 2} };
let globalSettings: OatSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<OatSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
	  // Reset all cached document settings
	  documentSettings.clear();
	} else {
	  globalSettings = <OatSettings>(
		(change.settings.oat || defaultSettings)
	  );
	}
  
	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
  });

  function getDocumentSettings(resource: string): Thenable<OatSettings> {
	if (!hasConfigurationCapability) {
	  return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
	  result = connection.workspace.getConfiguration({
		scopeUri: resource,
		section: 'oat'
	  });
	  documentSettings.set(resource, result);
	}
	return result;
  }

  // Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
  });

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// console.log("server validate");

	let settings = await getDocumentSettings(textDocument.uri);

	// console.log(settings.compiler.version);
	let compiler;
	switch (settings.compiler.version) {
		case 1:
			compiler = compiler_v1;
			break;
		case 2:
			compiler = compiler_v2;
			break;
		default:
			console.log("invalid compiler version, defaulting to 2");
			compiler = compiler_v2;
			break;
	}

	let errors : Array<compiler_error>;
	try {
		errors = compiler.compile([textDocument.getText()]);
	} catch (error) {
		console.log("error in compiler");
		console.log(error[3]);
		errors = [];
	}
	
	let diagnostics: Diagnostic[] = errors.map(
		function (error : compiler_error):Diagnostic {
			let start = error.location.start;
			let end = error.location.finish;
			let diagnostic:Diagnostic = {
				severity:DiagnosticSeverity.Error,
				range: {
					// line numbers need to be shifted to 0-index
					start: Position.create(start.line-1, start.char),
					end: Position.create(end.line-1, end.char)
				},
				message: error.message,
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
