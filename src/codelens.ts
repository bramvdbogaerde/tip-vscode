import * as vscode from "vscode";
import { TipDetector } from "./detect";
import { OptionStore } from "./store";

const TOP = new vscode.Range(0, 0, 0, 0);

export class TipCodeLensProvider implements vscode.CodeLensProvider {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  constructor(private readonly detector: TipDetector, private readonly store: OptionStore) {
    detector.onDidChange(() => this.emitter.fire());
    store.onDidChange(() => this.emitter.fire());
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (!(await this.detector.projectFor(document.uri))) return [];
    const lenses = [
      new vscode.CodeLens(TOP, { title: "▶ Run TIP", command: "tip.run", arguments: [document.uri] }),
      new vscode.CodeLens(TOP, { title: "Debug TIP", command: "tip.debug", arguments: [document.uri] }),
    ];
    if (this.store.get(document.uri)) {
      lenses.push(
        new vscode.CodeLens(TOP, {
          title: "▶ Run TIP (last options)",
          command: "tip.runWithLastOptions",
          arguments: [document.uri],
        }),
      );
    }
    return lenses;
  }
}

/**
 * CodeLenses cannot be coloured, so when no TIP source is found the warning
 * is shown as a red after-text decoration on the first line instead.
 */
export class MissingTipDecorator implements vscode.Disposable {
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: "  No TIP source found, please open the folder (containing) the TIP source",
      color: new vscode.ThemeColor("errorForeground"),
      fontStyle: "italic",
    },
  });
  private readonly disposables: vscode.Disposable[] = [this.decoration];

  constructor(private readonly detector: TipDetector) {
    const update = () => void this.updateAll();
    this.disposables.push(
      detector.onDidChange(update),
      vscode.window.onDidChangeVisibleTextEditors(update),
    );
    update();
  }

  private async updateAll() {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId !== "tip") continue;
      const missing = !(await this.detector.projectFor(editor.document.uri));
      editor.setDecorations(this.decoration, missing ? [TOP] : []);
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
