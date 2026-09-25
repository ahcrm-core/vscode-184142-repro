const { runTests } = require('@vscode/test-electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const trace = path.join(artifacts, 'trace.jsonl');
fs.writeFileSync(trace, '');
process.env.ISSUE_184142_TRACE = trace;

function events() {
  return fs.readFileSync(trace, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line).event]; } catch { return []; }
  });
}

function screenshot(name) {
  try { execFileSync('import', ['-window', 'root', path.join(artifacts, name)], { timeout: 5000 }); }
  catch (error) { console.log('Screenshot unavailable:', error.message); }
}

let deadline;
const timer = setInterval(() => {
  const observed = events();
  if (observed.includes('restart_requested') && !deadline) {
    deadline = Date.now() + 30000;
    setTimeout(() => {
      screenshot('restart-dialog.png');
      try {
        execFileSync('xdotool', ['search', '--class', 'code', 'windowactivate', '--sync', 'key', 'Tab', 'Return'], { timeout: 5000 });
        console.log('Sent Tab and Return to the VS Code window; inspect screenshot to confirm the selected action.');
      } catch (error) { console.log('UI input unavailable:', error.message); }
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
  const observed = events();
  let status = 'INCONCLUSIVE';
  if (!observed.includes('dirty_edit_done')) status = 'SETUP_FAILED';
  else if (!observed.includes('restart_requested')) status = 'RESTART_NOT_REQUESTED';
  else if (observed.filter(e => e === 'extension_activate').length > 1) status = 'RESTART_OBSERVED_EDITOR_STATE_UNVERIFIED';
  fs.writeFileSync(path.join(artifacts, 'result.json'), JSON.stringify({ status, observed, note: 'A restart alone is not proof of the unsaveable editor bug. Review the screenshot and repeat with editor click/save assertions before marking First Red.' }, null, 2));
  console.log('DIAGNOSTIC_STATUS:', status);
  process.exit(0);
}

setTimeout(finish, 100000);
runTests({
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(__dirname, 'extension-test.cjs'),
  launchArgs: ['--disable-workspace-trust', '--skip-welcome', '--disable-telemetry', root]
}).then(finish, error => {
  console.log('VS Code test host ended:', error.message);
  if (!events().includes('restart_requested')) finish();
});
