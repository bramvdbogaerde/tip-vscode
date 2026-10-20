import * as path from "path";
import * as vscode from "vscode";
import { TipProject } from "./detect";
import { buildArgs, TipOptions } from "./options";

const METALS = "scalameta.metals";
const MAIN_CLASS = "tip.Tip";

/**
 * Launches tip.Tip through Metals' debug adapter (debug type "scala").
 * Metals compiles and runs the class via its own build server (Bloop), so
 * sbt does not need to be on the PATH.
 *
 * Note on noDebug: Metals does not start a real debug session for a plain
 * run. It runs the main class as a VS Code task ("Scala run", definition
 * { type: "scala", task: "run", class }) in the terminal and hands VS Code a
 * dummy `echo` adapter, so startDebugging() resolves to false even when the
 * program runs fine. We therefore track the task instead of the session.
 */
export async function launchTip(project: TipProject, file: vscode.Uri, options: TipOptions, debug: boolean): Promise<void> {
  const metals = vscode.extensions.getExtension(METALS);
  if (!metals) {
    const install = "Install Metals";
    const choice = await vscode.window.showErrorMessage("Running TIP requires the Metals (Scala) extension.", install);
    if (choice === install) await vscode.commands.executeCommand("workbench.extensions.installExtension", METALS);
    return;
  }
  if (!metals.isActive) await metals.activate();

  const source = options.scope === "folder" ? path.dirname(file.fsPath) : file.fsPath;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const config: vscode.DebugConfiguration = {
    type: "scala",
    request: "launch",
    name: `TIP: ${path.basename(source)}`,
    mainClass: MAIN_CLASS,
    args: buildArgs(options, source),
    jvmOptions: ["-Dfile.encoding=UTF-8"], // mirrors tip.bat
    noDebug: !debug,
    tipRunId: runId,
  };

  await vscode.workspace.saveAll(false);
  const startedAt = Date.now();
  const tracker = new RunTracker(runId);
  let started: boolean;
  try {
    started = await vscode.debug.startDebugging(project.workspaceFolder, config, { noDebug: !debug });
  } catch {
    started = false;
  }
  // Give the task/session start events a moment to arrive.
  await new Promise((r) => setTimeout(r, 200));

  if (!(started && debug) && !tracker.hasStarted()) {
    tracker.dispose();
    void vscode.window.showErrorMessage(
      "Could not start TIP through Metals. Make sure Metals has imported the TIP build (Metals view → Import build).",
    );
    return;
  }
  void tracker.finished.then(() => offerDotFiles(options.outDir, startedAt));
}

/**
 * Notices when our run starts and ends: either the Metals "Scala run" task for
 * tip.Tip (plain run) or a scala debug session (debugging).
 */
class RunTracker implements vscode.Disposable {
  private started = false;
  private readonly disposables: vscode.Disposable[] = [];
  private task: vscode.TaskExecution | undefined;
  private session: vscode.DebugSession | undefined;
  readonly finished: Promise<void>;

  constructor(private readonly runId: string) {
    this.finished = new Promise((resolve) => {
      const done = () => {
        this.dispose();
        resolve();
      };
      this.disposables.push(
        vscode.tasks.onDidStartTask((e) => {
          if (!this.task && isTipRunTask(e.execution.task)) {
            this.task = e.execution;
            this.started = true;
          }
        }),
        vscode.tasks.onDidEndTask((e) => {
          if (e.execution === this.task) done();
        }),
        vscode.debug.onDidStartDebugSession((s) => {
          // Our own config when debugging; when Metals falls back to a real
          // session for a plain run it launches one with `debugServer` set.
          if (this.session || s.type !== "scala") return;
          if (s.configuration.tipRunId === this.runId && !s.configuration.noDebug) {
            this.session = s;
            this.started = true;
          } else if (s.configuration.debugServer !== undefined && s.configuration.tipRunId === undefined) {
            this.session = s;
            this.started = true;
          }
        }),
        vscode.debug.onDidTerminateDebugSession((s) => {
          if (s === this.session) done();
        }),
      );
    });
  }

  hasStarted(): boolean {
    // A very short run may have started before our listener saw it: also
    // accept a tip.Tip task that is still running.
    return this.started || vscode.tasks.taskExecutions.some((e) => isTipRunTask(e.task));
  }

  dispose() {
    for (const d of this.disposables.splice(0)) d.dispose();
  }
}

function isTipRunTask(task: vscode.Task): boolean {
  return task.source === "Metals" && task.definition.type === "scala" && task.definition.class === MAIN_CLASS;
}

/** After the run, offers to open the output folder if TIP wrote .dot files. */
async function offerDotFiles(outDir: string, startedAt: number) {
  const out = vscode.Uri.file(outDir);
  let produced = 0;
  try {
    for (const [name, type] of await vscode.workspace.fs.readDirectory(out)) {
      if (type !== vscode.FileType.File || !name.endsWith(".dot")) continue;
      const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(out, name));
      if (stat.mtime >= startedAt) produced++;
    }
  } catch {
    return;
  }
  if (produced === 0) return;
  const open = "Open output folder";
  const choice = await vscode.window.showInformationMessage(
    `TIP wrote ${produced} .dot file${produced === 1 ? "" : "s"} to ${outDir}.`,
    open,
  );
  if (choice !== open) return;
  if (vscode.workspace.getWorkspaceFolder(out)) {
    await vscode.commands.executeCommand("revealInExplorer", out);
  } else {
    await vscode.commands.executeCommand("revealFileInOS", out);
  }
}
