const vscode = require('vscode');
const fs = require('node:fs');

function trace(event, extra = {}) {
  const file = process.env.ISSUE_184142_TRACE;
  if (file) fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event, ...extra }) + '\n');
}

function activate(context) {
  trace('extension_activate');
  const onDidChange = new vscode.EventEmitter();
  context.subscriptions.push(onDidChange);
  const documents = new Map();

  const edit = document => {
    const before = document.value;
    const after = before + 'edit\n';
    document.value = after;
    trace('edit_received', { uri: document.uri.toString(), bytes: after.length });
    onDidChange.fire({ document, label: 'Probe edit', undo() { document.value = before; }, redo() { document.value = after; } });
    for (const panel of document.panels) panel.webview.postMessage({ value: after });
  };

  context.subscriptions.push(vscode.commands.registerCommand('orqelon.issue184142.edit', () => {
    const document = [...documents.values()][0];
    if (!document) throw new Error('Probe document is not open');
    edit(document);
  }));

  const provider = {
    onDidChangeCustomDocument: onDidChange.event,
    async openCustomDocument(uri, openContext) {
      const source = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : uri;
      const value = Buffer.from(await vscode.workspace.fs.readFile(source)).toString('utf8');
      const document = { uri, value, panels: new Set(), dispose() { documents.delete(uri.toString()); trace('document_dispose'); } };
      documents.set(uri.toString(), document);
      trace('document_open', { backup: !!openContext.backupId });
      return document;
    },
    async resolveCustomEditor(document, panel) {
      document.panels.add(panel);
      panel.onDidDispose(() => document.panels.delete(panel));
      panel.webview.options = { enableScripts: true, localResourceRoots: [] };
      panel.webview.html = `<html><body><h1>Issue 184142 probe</h1><button id="edit">Edit marker</button><script>const api=acquireVsCodeApi();document.getElementById('edit').onclick=()=>api.postMessage({type:'edit'});</script></body></html>`;
      panel.webview.onDidReceiveMessage(message => { if (message?.type === 'edit') edit(document); });
      trace('editor_resolve');
    },
    async saveCustomDocument(document) {
      await vscode.workspace.fs.writeFile(document.uri, Buffer.from(document.value));
      trace('save');
    },
    async saveCustomDocumentAs(document, destination) {
      await vscode.workspace.fs.writeFile(destination, Buffer.from(document.value));
      trace('save_as');
    },
    async revertCustomDocument(document) {
      document.value = Buffer.from(await vscode.workspace.fs.readFile(document.uri)).toString('utf8');
      trace('revert');
    },
    async backupCustomDocument(document, context) {
      await vscode.workspace.fs.writeFile(context.destination, Buffer.from(document.value));
      trace('backup');
      return { id: context.destination.toString(), delete() { void vscode.workspace.fs.delete(context.destination).catch(() => {}); } };
    }
  };
  context.subscriptions.push(vscode.window.registerCustomEditorProvider('orqelon.issue184142', provider, { supportsMultipleEditorsPerDocument: false }));
}

function deactivate() { trace('extension_deactivate'); }
module.exports = { activate, deactivate };
