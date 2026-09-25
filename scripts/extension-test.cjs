const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');

function log(event) {
  fs.appendFileSync(process.env.ISSUE_184142_TRACE, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event }) + '\n');
}

async function run() {
  log('test_host_start');
  const fixture = vscode.Uri.file(path.join(__dirname, '..', 'fixture.orqtest'));
  await vscode.commands.executeCommand('vscode.openWith', fixture, 'orqelon.issue184142');
  await vscode.commands.executeCommand('orqelon.issue184142.edit');
  log('dirty_edit_done');
  // The real restart command must run while the editable custom editor is open.
  log('restart_requested');
  try {
    await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
    log('restart_command_resolved');
  } catch (error) {
    log('restart_command_error:' + String(error));
  }
}

module.exports = { run };
