import * as path from "path";
import * as vscode from "vscode";

/** A TIP source checkout, found in (or directly below) a workspace folder. */
export interface TipProject {
  /** The workspace folder Metals runs in. */
  workspaceFolder: vscode.WorkspaceFolder;
  /** The directory containing build.sbt and src/tip/Tip.scala. */
  root: vscode.Uri;
}

const BUILD_NAME = /^\s*name\s*:=\s*"tip"\s*$/m;

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

/**
 * The marker for "this really is TIP": build.sbt names the project "tip"
 * and src/tip/Tip.scala defines the `tip.Tip` entry point. Both files are
 * part of the upstream TIP repository, so nothing needs to be added to it.
 */
async function isTipRoot(root: vscode.Uri): Promise<boolean> {
  const [build, main] = await Promise.all([
    readText(vscode.Uri.joinPath(root, "build.sbt")),
    readText(vscode.Uri.joinPath(root, "src", "tip", "Tip.scala")),
  ]);
  return (
    build !== undefined &&
    main !== undefined &&
    BUILD_NAME.test(build) &&
    /^\s*package\s+tip\s*$/m.test(main) &&
    /\bobject\s+Tip\s+extends\s+App\b/.test(main)
  );
}

export class TipDetector implements vscode.Disposable {
  private projects: TipProject[] = [];
  private pending: Promise<void> | undefined;
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [this.emitter];

  /** Fires whenever the set of detected TIP projects may have changed. */
  readonly onDidChange = this.emitter.event;

  constructor() {
    const refresh = () => void this.refresh();
    for (const glob of ["**/build.sbt", "**/src/tip/Tip.scala"]) {
      const watcher = vscode.workspace.createFileSystemWatcher(glob);
      watcher.onDidCreate(refresh);
      watcher.onDidChange(refresh);
      watcher.onDidDelete(refresh);
      this.disposables.push(watcher);
    }
    this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(refresh));
  }

  refresh(): Promise<void> {
    this.pending = this.scan().then((projects) => {
      this.projects = projects;
      void vscode.commands.executeCommand("setContext", "tip.workspaceDetected", projects.length > 0);
      this.emitter.fire();
    });
    return this.pending;
  }

  /** Returns the TIP project to use for `file`, if any. */
  async projectFor(file: vscode.Uri): Promise<TipProject | undefined> {
    await (this.pending ?? this.refresh());
    // Prefer the TIP checkout that contains the file, then one in the same
    // workspace folder, then any.
    const inside = this.projects.find((p) => isInside(file, p.root));
    if (inside) return inside;
    const folder = vscode.workspace.getWorkspaceFolder(file);
    return this.projects.find((p) => p.workspaceFolder === folder) ?? this.projects[0];
  }

  private async scan(): Promise<TipProject[]> {
    const found: TipProject[] = [];
    for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
      // The workspace folder itself, or a direct sub-directory (e.g. a course
      // folder with TIP/ next to the exercises).
      const candidates = [workspaceFolder.uri];
      try {
        for (const [name, type] of await vscode.workspace.fs.readDirectory(workspaceFolder.uri)) {
          if (type === vscode.FileType.Directory && !name.startsWith(".") && name !== "node_modules") {
            candidates.push(vscode.Uri.joinPath(workspaceFolder.uri, name));
          }
        }
      } catch {
        // unreadable folder: only check the folder itself
      }
      for (const root of candidates) {
        if (await isTipRoot(root)) found.push({ workspaceFolder, root });
      }
    }
    return found;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

function isInside(file: vscode.Uri, dir: vscode.Uri): boolean {
  const rel = path.relative(dir.fsPath, file.fsPath);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}
