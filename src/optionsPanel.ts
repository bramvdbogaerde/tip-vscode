import * as path from "path";
import * as vscode from "vscode";
import { DATAFLOW_ANALYSES, DEFAULT_SOLVER, FLAG_GROUPS, SOLVERS, TipOptions } from "./options";

export interface PanelResult {
  options: TipOptions;
  debug: boolean;
}

type FromWebview =
  | { type: "submit"; options: TipOptions; debug: boolean }
  | { type: "cancel" }
  | { type: "browse"; current: string };

let current: { panel: vscode.WebviewPanel; resolve: (r: PanelResult | undefined) => void } | undefined;

/** Shows the options form; resolves with the chosen options, or undefined when cancelled. */
export function askOptions(file: vscode.Uri, initial: TipOptions, debug: boolean): Promise<PanelResult | undefined> {
  if (current) {
    current.resolve(undefined);
    current.panel.dispose();
  }

  const panel = vscode.window.createWebviewPanel(
    "tipOptions",
    `TIP: ${path.basename(file.fsPath)}`,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    { enableScripts: true, localResourceRoots: [] },
  );

  return new Promise((resolve) => {
    let done = false;
    const finish = (result: PanelResult | undefined) => {
      if (done) return;
      done = true;
      current = undefined;
      resolve(result);
      panel.dispose();
    };
    current = { panel, resolve: finish };

    panel.onDidDispose(() => finish(undefined));
    panel.webview.onDidReceiveMessage(async (msg: FromWebview) => {
      switch (msg.type) {
        case "submit":
          finish({ options: msg.options, debug: msg.debug });
          break;
        case "cancel":
          finish(undefined);
          break;
        case "browse": {
          const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: vscode.Uri.file(msg.current),
            openLabel: "Use as output directory",
          });
          if (picked?.[0]) void panel.webview.postMessage({ type: "outDir", value: picked[0].fsPath });
          break;
        }
      }
    });
    panel.webview.html = render(panel.webview, file, initial, debug);
  });
}

function render(webview: vscode.Webview, file: vscode.Uri, initial: TipOptions, debug: boolean): string {
  const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
  const flag = (f: string, description: string) => `
      <label class="row">
        <input type="checkbox" data-flag="${f}" ${initial.flags.includes(f) ? "checked" : ""}>
        <code>${f}</code><span class="desc">${esc(description)}</span>
      </label>`;
  const groups = FLAG_GROUPS.map(
    (g) => `<fieldset><legend>${esc(g.label)}</legend>${g.flags.map((f) => flag(f.flag, f.description)).join("")}</fieldset>`,
  ).join("");
  const solverOptions = (selected: string) =>
    SOLVERS.map(
      (s) => `<option value="${s.flag}" title="${esc(s.description)}" ${s.flag === selected ? "selected" : ""}>${s.flag} — ${esc(s.description)}</option>`,
    ).join("");
  const dataflow = DATAFLOW_ANALYSES.map((a) => {
    const solver = initial.dataflow[a.flag];
    return `
      <div class="row dataflow">
        <label><input type="checkbox" data-analysis="${a.flag}" ${solver !== undefined ? "checked" : ""}>
        <code>-${a.flag}</code><span class="desc">${esc(a.description)}</span></label>
        <select data-solver="${a.flag}" ${solver === undefined ? "disabled" : ""}>${solverOptions(solver ?? DEFAULT_SOLVER)}</select>
      </div>`;
  }).join("");
  const dir = path.basename(path.dirname(file.fsPath));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 16px 16px; }
  h2 { font-weight: 600; margin: 16px 0 4px; }
  .file { color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
  fieldset { border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #8884)); border-radius: 4px; margin: 0 0 12px; padding: 6px 12px 10px; }
  legend { font-weight: 600; padding: 0 4px; }
  .row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .row label { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
  code { font-family: var(--vscode-editor-font-family); min-width: 11em; }
  .desc { color: var(--vscode-descriptionForeground); }
  .hint { color: var(--vscode-descriptionForeground); margin: 2px 0 6px; }
  select, input[type=text] { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 3px 4px; font: inherit; }
  select { max-width: 22em; }
  select:disabled { opacity: .5; }
  input[type=text] { flex: 1; min-width: 0; }
  button { font: inherit; padding: 4px 14px; border: none; border-radius: 2px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  .actions { display: flex; gap: 8px; margin-top: 4px; }
  .preview { font-family: var(--vscode-editor-font-family); background: var(--vscode-textCodeBlock-background); padding: 6px 8px; border-radius: 3px; word-break: break-all; margin: 0 0 12px; }
</style>
</head>
<body>
  <h2>Run TIP</h2>
  <div class="file">${esc(file.fsPath)}</div>

  ${groups}

  <fieldset><legend>Dataflow analyses</legend>
    <div class="hint">Each enabled analysis writes its result as a .dot graph to the output directory. Pick a fixpoint solver for each one. Not every analysis supports every solver; TIP reports unsupported combinations.</div>
    ${dataflow}
  </fieldset>

  <fieldset><legend>Source and output</legend>
    <label class="row"><input type="radio" name="scope" value="file" ${initial.scope === "file" ? "checked" : ""}> this file only</label>
    <label class="row"><input type="radio" name="scope" value="folder" ${initial.scope === "folder" ? "checked" : ""}> all .tip files in <code>${esc(dir)}/</code></label>
    <div class="row"><span>Output directory</span><input type="text" id="outDir" value="${esc(initial.outDir)}"><button id="browse">Browse…</button></div>
  </fieldset>

  <div class="preview" id="preview"></div>

  <div class="actions">
    <button id="run" class="${debug ? "" : "primary"}">Run</button>
    <button id="debug" class="${debug ? "primary" : ""}">Debug</button>
    <button id="cancel">Cancel</button>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const flagOrder = ${JSON.stringify(FLAG_GROUPS.flatMap((g) => g.flags.map((f) => f.flag)))};
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function collect() {
    const flags = $$("input[data-flag]").filter((c) => c.checked).map((c) => c.dataset.flag);
    const dataflow = {};
    for (const c of $$("input[data-analysis]")) {
      if (c.checked) dataflow[c.dataset.analysis] = $('select[data-solver="' + c.dataset.analysis + '"]').value;
    }
    const scope = $('input[name="scope"]:checked').value;
    return { flags, dataflow, scope, outDir: $("#outDir").value.trim() };
  }

  function preview() {
    const o = collect();
    const parts = ["tip"];
    for (const f of flagOrder) if (o.flags.includes(f)) parts.push(f);
    for (const [a, s] of Object.entries(o.dataflow)) { parts.push("-" + a); if (s !== "${DEFAULT_SOLVER}") parts.push(s); }
    parts.push(o.scope === "file" ? "<file>" : "<folder>", o.outDir || "<out>");
    $("#preview").textContent = parts.join(" ");
  }

  for (const c of $$("input[data-analysis]")) {
    c.addEventListener("change", () => { $('select[data-solver="' + c.dataset.analysis + '"]').disabled = !c.checked; });
  }
  document.addEventListener("input", preview);
  document.addEventListener("change", preview);

  const submit = (debug) => vscode.postMessage({ type: "submit", options: collect(), debug });
  $("#run").addEventListener("click", () => submit(false));
  $("#debug").addEventListener("click", () => submit(true));
  $("#cancel").addEventListener("click", () => vscode.postMessage({ type: "cancel" }));
  $("#browse").addEventListener("click", () => vscode.postMessage({ type: "browse", current: $("#outDir").value }));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "BUTTON") submit(${debug});
    if (e.key === "Escape") vscode.postMessage({ type: "cancel" });
  });
  window.addEventListener("message", (e) => {
    if (e.data.type === "outDir") { $("#outDir").value = e.data.value; preview(); }
  });
  preview();
  (document.querySelector("#${debug ? "debug" : "run"}")).focus();
</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
