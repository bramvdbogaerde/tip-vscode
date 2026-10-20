import * as vscode from "vscode";
import { MissingTipDecorator, TipCodeLensProvider } from "./codelens";
import { TipDetector } from "./detect";
import { launchTip } from "./launch";
import { defaultOptions } from "./options";
import { askOptions } from "./optionsPanel";
import { OptionStore } from "./store";

export function activate(context: vscode.ExtensionContext) {
  const detector = new TipDetector();
  const store = new OptionStore(context.workspaceState);
  void detector.refresh();

  /** Resolves the .tip file a command applies to: the CodeLens argument or the active editor. */
  const targetFile = (uri?: vscode.Uri) => {
    const file = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!file || !file.fsPath.endsWith(".tip")) {
      void vscode.window.showErrorMessage("Open a .tip file to run TIP.");
      return undefined;
    }
    return file;
  };

  const projectFor = async (file: vscode.Uri) => {
    const project = await detector.projectFor(file);
    if (!project) {
      void vscode.window.showErrorMessage("No TIP source found, please open the folder (containing) the TIP source.");
    }
    return project;
  };

  const runWithDialog = async (uri: vscode.Uri | undefined, debug: boolean) => {
    const file = targetFile(uri);
    if (!file) return;
    const project = await projectFor(file);
    if (!project) return;
    const initial = store.get(file) ?? defaultOptions(vscode.Uri.joinPath(project.root, "out").fsPath);
    const result = await askOptions(file, initial, debug);
    if (!result) return;
    await store.set(file, result.options);
    await launchTip(project, file, result.options, result.debug);
  };

  context.subscriptions.push(
    detector,
    new MissingTipDecorator(detector),
    vscode.languages.registerCodeLensProvider({ language: "tip" }, new TipCodeLensProvider(detector, store)),
    vscode.commands.registerCommand("tip.run", (uri?: vscode.Uri) => runWithDialog(uri, false)),
    vscode.commands.registerCommand("tip.debug", (uri?: vscode.Uri) => runWithDialog(uri, true)),
    vscode.commands.registerCommand("tip.runWithLastOptions", async (uri?: vscode.Uri) => {
      const file = targetFile(uri);
      if (!file) return;
      const options = store.get(file);
      if (!options) return runWithDialog(file, false);
      const project = await projectFor(file);
      if (project) await launchTip(project, file, options, false);
    }),
  );
}

export function deactivate() {}
