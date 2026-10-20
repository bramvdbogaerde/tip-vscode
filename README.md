# TIP for VS Code

Support for the [TIP](https://github.com/cs-au-dk/TIP) teaching language:

- Syntax highlighting for `.tip` files.
- **▶ Run TIP** / **Debug TIP** links at the top of every `.tip` file. They open a form with all TIP command-line options, then run `tip.Tip` through Metals. sbt does not need to be on your `PATH`.
- **▶ Run TIP (last options)** re-runs with the options you used last for that file.

## Requirements

- The [Metals](https://marketplace.visualstudio.com/items?itemName=scalameta.metals) extension. It is installed automatically as a dependency.
- The TIP source code must be open in the workspace, either as the workspace folder itself or as a direct sub-folder of it. Metals must have imported its build (Metals view → *Import build*).

TIP is detected by its own files, so nothing has to be added to the TIP repository: `build.sbt` must declare `name := "tip"`, and `src/tip/Tip.scala` must define `object Tip extends App` in `package tip`. When no TIP source is found, `.tip` files show a red hint on their first line.

## Usage

1. Open a `.tip` file and click **▶ Run TIP** (or **Debug TIP**, which stops at breakpoints in the TIP Scala sources).
2. In the form, pick the analyses and solvers, whether to analyze only this file or every `.tip` file in its folder, and the output directory (default `<TIP>/out`).
3. Click **Run** or **Debug**.

TIP runs in Metals' debug session. Its output appears there, and programs that use `input` read from it. If the run produces `.dot` files, a notification offers to open the output folder.

## Building

```sh
npm install
npm run compile
npm run package   # produces tip-vscode-<version>.vsix
```

Install the `.vsix` with *Extensions → … → Install from VSIX…*, or with `code --install-extension tip-vscode-0.1.0.vsix`.
