const vscode = require('vscode');
const fs = require('node:fs');

function trace(event, extra = {}) {
  const file = process.env.ISSUE_184142_TRACE;
  if (file) fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event, ...extra }) + '\n');
}

function activate(context) {
  const installed = process.env.ISSUE_184142_INSTALLED === '1';
  const hadWorkspaceSave = installed && fs.readFileSync(process.env.ISSUE_184142_TRACE, 'utf8').includes('"event":"workspace_save_requested"');
  trace('extension_activate');
  const onDidChange = new vscode.EventEmitter();
  context.subscriptions.push(onDidChange);
  const documents = new Map();
  let probeStarted = false;

  const edit = document => {
    const before = document.value;
    const after = before + 'edit\n';
    document.value = after;
    trace('edit_received', { uri: document.uri.toString(), bytes: after.length });
    onDidChange.fire({ document, label: 'Probe edit', undo() { document.value = before; trace('undo'); for (const panel of document.panels) panel.webview.postMessage({ value: before }); }, redo() { document.value = after; trace('redo'); for (const panel of document.panels) panel.webview.postMessage({ value: after }); } });
    for (const panel of document.panels) panel.webview.postMessage({ value: after });
  };

  context.subscriptions.push(vscode.commands.registerCommand('orqelon.issue184142.edit', () => {
    const document = [...documents.values()][0];
    if (!document) throw new Error('Probe document is not open');
    edit(document);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('orqelon.issue184142.alive', () => {
    const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs.map(tab => ({ label: tab.label, dirty: tab.isDirty, active: tab.isActive })));
    trace('alive', { openDocuments: [...documents.keys()], tabs });
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
      panel.webview.html = `<html><body><h1>Issue 184142 probe</h1><p id="value"></p><button id="edit">Edit marker</button><script>const api=acquireVsCodeApi();document.getElementById('edit').onclick=()=>api.postMessage({type:'edit'});window.addEventListener('message',e=>{document.getElementById('value').textContent=e.data.value});</script></body></html>`;
      panel.webview.postMessage({ value: document.value });
      panel.webview.onDidReceiveMessage(message => { if (message?.type === 'edit') edit(document); });
      trace('editor_resolve');
      if (installed && !hadWorkspaceSave && !probeStarted) {
        probeStarted = true;
        setTimeout(async () => {
          try {
            edit(document);
            await vscode.commands.executeCommand('undo');
            await vscode.commands.executeCommand('redo');
            trace('dirty_edit_done');
            trace('workspace_save_requested');
            await vscode.commands.executeCommand('workbench.action.saveWorkspaceAs');
            trace('workspace_save_command_resolved');
          } catch (error) { trace('probe_error', { message: String(error) }); }
        }, 700);
      }
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
  if (installed && hadWorkspaceSave) {
    setTimeout(() => { void vscode.commands.executeCommand('orqelon.issue184142.alive').catch(error => trace('alive_error', { message: String(error) })); }, 1000);
  } else if (installed) {
    setTimeout(() => {
      void vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(process.env.ISSUE_184142_FIXTURE), 'orqelon.issue184142')
        .catch(error => trace('open_with_error', { message: String(error) }));
    }, 600);
  }
}

function deactivate() { trace('extension_deactivate'); }
module.exports = { activate, deactivate };
