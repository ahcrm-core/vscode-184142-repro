const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');

function log(event) {
  fs.appendFileSync(process.env.ISSUE_184142_TRACE, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event }) + '\n');
}

async function run() {
  log('test_host_start');
  const previous = fs.readFileSync(process.env.ISSUE_184142_TRACE, 'utf8');
  if (previous.includes('"event":"workspace_save_requested"')) {
    log('test_host_restarted');
    await vscode.commands.executeCommand('orqelon.issue184142.alive');
    return;
  }
  await vscode.workspace.getConfiguration('files').update('hotExit', 'onExitAndWindowClose', vscode.ConfigurationTarget.Global);
  await vscode.workspace.getConfiguration('files').update('autoSave', 'off', vscode.ConfigurationTarget.Global);
  const fixture = vscode.Uri.file(path.join(__dirname, '..', 'fixture.orqtest'));
  await vscode.commands.executeCommand('vscode.openWith', fixture, 'orqelon.issue184142');
  await vscode.commands.executeCommand('orqelon.issue184142.edit');
  await vscode.commands.executeCommand('undo');
  await vscode.commands.executeCommand('redo');
  log('undo_redo_done');
  log('dirty_edit_done');
  // This is the reported Save Workspace As path, not a direct extension-host restart.
  log('workspace_save_requested');
  try {
    await vscode.commands.executeCommand('workbench.action.saveWorkspaceAs');
    log('workspace_save_command_resolved');
  } catch (error) {
    log('workspace_save_command_error:' + String(error));
  }
}

module.exports = { run };
