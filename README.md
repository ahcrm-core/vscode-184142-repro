# VS Code custom editor restart diagnostic

Isolated public probe for [microsoft/vscode#184142](https://github.com/microsoft/vscode/issues/184142). It edits only `fixture.orqtest` and records extension activation, custom document, edit, backup, and restart events. No production data or AHCRM-Core code is used.

The [GitHub Actions workflow](.github/workflows/reproduce.yml) runs the probe in an Xvfb display. Its `issue-184142-diagnostic` artifact contains the trace, screenshot when available, and `result.json`.

The diagnostic packages the provider as a VSIX and installs it in a disposable profile of VS Code 1.136.1 on Linux. It starts in an empty window, registers the installed custom editor, opens the synthetic fixture with that editor, edits it, performs Undo/Redo, then calls VS Code's `workbench.action.saveWorkspaceAs` command. The runner captures the save dialog and only enters a disposable workspace path when it identifies that dialog by title. An `alive` snapshot is recorded if the installed extension activates after the host restarts.

The synthetic extension explicitly supports VS Code's Restricted Mode so a loose file can open with the custom editor in a fresh profile. It reads only the fixture and uses no workspace commands or production data.

**Result policy:** `RESTART_OBSERVED_EDITOR_STATE_NEEDS_REVIEW` means the extension host restarted; it is **not** a reproduced bug. A real First Red additionally requires seeing that the original webview still accepts an edit but does not become dirty or save. `INCONCLUSIVE` is expected if Save Workspace As or Restart Anyway cannot be driven reliably. Linux is a separate platform from the reported macOS reproduction. Never report a passing workflow as a passing VS Code regression.

The save dialog and restart prompt may vary with VS Code versions. Review the saved screenshots before interpreting results. The CI job is limited to twelve minutes and runs only for this test branch or when manually dispatched.
