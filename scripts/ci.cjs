const { runTests } = require('@vscode/test-electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const workspace = path.join(artifacts, 'probe.code-workspace');
fs.mkdirSync(artifacts, { recursive: true });
const trace = path.join(artifacts, 'trace.jsonl');
fs.writeFileSync(trace, '');
process.env.ISSUE_184142_TRACE = trace;

function records() {
  return fs.readFileSync(trace, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function screenshot(name) {
  try { execFileSync('import', ['-window', 'root', path.join(artifacts, name)], { timeout: 5000 }); }
  catch (error) { console.log('Screenshot unavailable:', error.message); }
}

function xdotool(args) { return execFileSync('xdotool', args, { encoding: 'utf8', timeout: 5000 }).trim(); }
function windows() {
  try {
    return xdotool(['search', '--onlyvisible', '--name', '.']).split('\n').filter(Boolean).map(id => {
      try { return { id, title: xdotool(['getwindowname', id]) }; }
      catch { return { id, title: '' }; }
    });
  } catch { return []; }
}

let started = false;
let deadline;
const timer = setInterval(() => {
  const observed = records();
  if (observed.some(item => item.event === 'workspace_save_requested') && !started) {
    started = true;
    deadline = Date.now() + 45000;
    setTimeout(() => {
      screenshot('save-workspace-dialog.png');
      const visible = windows();
      console.log('Visible windows:', JSON.stringify(visible));
      const dialog = visible.find(item => /save.*workspace|workspace.*save/i.test(item.title));
      if (!dialog) { console.log('No workspace save dialog identified; no blind keypress sent.'); return; }
      try {
        xdotool(['windowfocus', dialog.id]);
        xdotool(['key', '--clearmodifiers', 'ctrl+a']);
        xdotool(['type', '--clearmodifiers', '--delay', '2', workspace]);
        xdotool(['key', '--clearmodifiers', 'Return']);
        console.log('Submitted synthetic workspace path to:', dialog.title);
        setTimeout(() => { screenshot('after-workspace-save.png'); console.log('Visible windows after save:', JSON.stringify(windows())); }, 3000);
      } catch (error) { console.log('Workspace save input failed:', error.message); }
    }, 2000);
  }
  if (deadline && Date.now() >= deadline) finish();
}, 500);

let done = false;
function finish() {
  if (done) return;
  done = true;
  clearInterval(timer);
  screenshot('final-state.png');
  const observed = records();
  const events = observed.map(item => item.event);
  let status = 'INCONCLUSIVE';
  if (!events.includes('dirty_edit_done')) status = 'SETUP_FAILED';
  else if (!events.includes('workspace_save_requested')) status = 'WORKSPACE_SAVE_NOT_REQUESTED';
  else if (events.includes('test_host_restarted') && events.includes('alive')) status = 'RESTART_OBSERVED_EDITOR_STATE_NEEDS_REVIEW';
  fs.writeFileSync(path.join(artifacts, 'result.json'), JSON.stringify({ status, workspaceFileCreated: fs.existsSync(workspace), observed, note: 'First Red requires the real Save Workspace As/Restart Anyway transition and evidence that the surviving editor cannot save or track changes. A green CI job only means the diagnostic completed.' }, null, 2));
  console.log('DIAGNOSTIC_STATUS:', status);
  process.exit(0);
}

setTimeout(finish, 110000);
runTests({
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(__dirname, 'extension-test.cjs'),
  launchArgs: ['--disable-workspace-trust', '--skip-welcome', '--disable-telemetry']
}).then(() => { if (!started) finish(); }, error => {
  console.log('VS Code test host ended:', error.message);
  if (!started) finish();
});
