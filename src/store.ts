import * as vscode from "vscode";
import { TipOptions } from "./options";

/** Remembers the last options used for each .tip file (in workspaceState). */
export class OptionStore {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  constructor(private readonly state: vscode.Memento) {}

  get(file: vscode.Uri): TipOptions | undefined {
    return this.state.get<TipOptions>(key(file));
  }

  async set(file: vscode.Uri, options: TipOptions) {
    await this.state.update(key(file), options);
    this.emitter.fire();
  }
}

function key(file: vscode.Uri) {
  return `tip.options:${file.toString()}`;
}
