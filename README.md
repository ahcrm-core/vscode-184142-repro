# VS Code custom editor restart diagnostic

Isolated public probe for [microsoft/vscode#184142](https://github.com/microsoft/vscode/issues/184142). It edits only `fixture.orqtest` and records extension activation, custom document, edit, backup, and restart events. No production data or AHCRM-Core code is used.

The [GitHub Actions workflow](.github/workflows/reproduce.yml) runs the probe in an Xvfb display. Its `issue-184142-diagnostic` artifact contains the trace, screenshot when available, and `result.json`.

**Result policy:** `RESTART_OBSERVED_EDITOR_STATE_UNVERIFIED` means the extension host restarted; it is **not** a reproduced bug. A real First Red additionally requires seeing that the original webview still accepts an edit but does not become dirty or save. `INCONCLUSIVE` is expected if the restart confirmation dialog is not navigated successfully. Never report a passing workflow as a passing VS Code regression.

The shell's `xdotool` sends Tab and Return to the restart prompt, which may vary with VS Code versions. Review the saved screenshot before interpreting results. The CI job is limited to twelve minutes and runs only for this test branch or when manually dispatched.
