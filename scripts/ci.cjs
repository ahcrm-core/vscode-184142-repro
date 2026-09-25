const { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } = require('@vscode/test-electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

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
let postRestartClicked = false;
const timer = setInterval(() => {
  const observed = records();
  if (observed.some(item => item.event === 'workspace_save_requested') && !started) {
    started = true;
    deadline = Date.now() + 60000;
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
        setTimeout(() => {
          if (!fs.existsSync(workspace) && windows().some(item => item.id === dialog.id)) {
            const lines = xdotool(['getwindowgeometry', '--shell', dialog.id]);
            const geometry = Object.fromEntries(lines.split('\n').filter(line => line.includes('=')).map(line => line.split('=')));
            const x = Number(geometry.X) + Number(geometry.WIDTH) - 50;
            const y = Number(geometry.Y) + Number(geometry.HEIGHT) - 27;
            xdotool(['mousemove', '--sync', String(x), String(y), 'click', '1']);
            console.log('Clicked Save in the identified workspace dialog.');
          }
          setTimeout(() => {
            screenshot('after-workspace-save.png');
            const next = windows();
            console.log('Visible windows after save:', JSON.stringify(next));
            const confirm = next.find(item => item.title === 'Visual Studio Code');
            if (!confirm) { console.log('No separate VS Code restart confirmation identified.'); return; }
            try {
              const lines = xdotool(['getwindowgeometry', '--shell', confirm.id]);
              const geometry = Object.fromEntries(lines.split('\n').filter(line => line.includes('=')).map(line => line.split('=')));
              const width = Number(geometry.WIDTH);
              const height = Number(geometry.HEIGHT);
              if (width < 400 || width > 900 || height < 100 || height > 400) throw new Error('Confirmation window geometry unexpected');
              console.log('Restart dialog geometry:', JSON.stringify(geometry));
              xdotool(['windowfocus', confirm.id]);
              xdotool(['mousemove', '--sync', '--window', confirm.id, String(Math.round(width * 0.75)), String(height - 17), 'click', '1']);
              fs.appendFileSync(trace, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event: 'restart_anyway_clicked' }) + '\n');
              console.log('Clicked Restart Anyway in the identified confirmation window.');
              setTimeout(() => { screenshot('after-restart-anyway.png'); console.log('Visible windows after restart:', JSON.stringify(windows())); }, 5000);
            } catch (error) { console.log('Restart confirmation input failed:', error.message); }
          }, 3000);
        }, 1200);
      } catch (error) { console.log('Workspace save input failed:', error.message); }
    }, 2000);
  }
  if (!postRestartClicked && observed.some(item => item.event === 'alive')) {
    postRestartClicked = true;
    screenshot('before-webview-click.png');
    const main = windows().find(item => item.title.includes('fixture.orqtest'));
    if (main) {
      try {
        xdotool(['windowfocus', main.id]);
        xdotool(['mousemove', '--sync', '--window', main.id, '115', '194', 'click', '1']);
        fs.appendFileSync(trace, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, event: 'webview_click_sent' }) + '\n');
        setTimeout(() => screenshot('after-webview-click.png'), 1000);
      } catch (error) { console.log('Webview click input failed:', error.message); }
    }
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
  else if (events.filter(event => event === 'extension_activate').length > 1 && events.includes('alive')) status = 'RESTART_OBSERVED_EDITOR_STATE_NEEDS_REVIEW';
  if (status === 'RESTART_OBSERVED_EDITOR_STATE_NEEDS_REVIEW' && observed.find(item => item.event === 'after_save_tab')?.dirty && !events.includes('save')) status = 'RESTART_OBSERVED_SAVE_NOT_COMPLETED';
  fs.writeFileSync(path.join(artifacts, 'result.json'), JSON.stringify({ status, workspaceFileCreated: fs.existsSync(workspace), observed, note: 'First Red requires the real Save Workspace As/Restart Anyway transition and evidence that the surviving editor cannot save or track changes. A green CI job only means the diagnostic completed.' }, null, 2));
  console.log('DIAGNOSTIC_STATUS:', status);
  process.exit(0);
}

setTimeout(finish, 190000);

(async () => {
  const executable = await downloadAndUnzipVSCode('1.136.1');
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable);
  const userData = path.join(root, '.run-user-data');
  const extensions = path.join(root, '.run-extensions');
  const vsix = path.join(artifacts, 'probe.vsix');
  const options = ['--user-data-dir', userData, '--extensions-dir', extensions];
  execFileSync(cli, [...cliArgs, ...options, '--install-extension', vsix, '--force'], { timeout: 45000, stdio: 'inherit' });
  console.log('Installed synthetic probe from VSIX into disposable extension directory.');
  const child = spawn(executable, [
    '--no-sandbox', '--disable-gpu-sandbox', '--disable-updates', '--skip-welcome',
    '--skip-release-notes', '--disable-telemetry', '--new-window', ...options
  ], { env: { ...process.env, ISSUE_184142_INSTALLED: '1', ISSUE_184142_FIXTURE: path.join(root, 'fixture.orqtest') }, stdio: 'ignore' });
  child.on('exit', (code, signal) => { console.log('VS Code exited:', code, signal); if (!started) finish(); });
})().catch(error => { console.log('Installed VS Code setup failed:', error.stack || String(error)); finish(); });
