# Simutrans Addon Tools

[日本語](README.md)

A VS Code extension for Simutrans addon development. It includes three features:

- [Image viewer](#image-viewer)  
  View special colors (player colors and lights) as they appear in the game

- [Pak viewer](#pak-viewer)  
  View the structure, values and images of `.pak` files

- [dat language support](#dat-language-support)  
  Syntax highlighting, image previews and jumping to name references

The UI is available in English and Japanese. It follows the VS Code display language.

## Installation

1. Download the `.vsix` file from [Releases](https://github.com/G-alumi/simutrans-addon-tools/releases/latest)
2. In the VS Code Extensions view, choose "..." → "Install from VSIX..." and select the downloaded file

## Image viewer

![Image viewer](images/image-viewer.png)

Supported formats:

- PNG, JPEG, GIF, BMP, WebP, SVG, ICO
- APD (`.apd`)

### Controls

| Action | Description |
|---|---|
| Mouse wheel | Zoom in and out (up to 12x, pixel-perfect) |
| Drag | Move the view |
| `I` key | Show file information (file name, format, file size, width, height) |
| Right-click | Copy the image to the clipboard |

The status bar shows the cursor position, image size, file size and zoom level.

### Simutrans display

![Simutrans display](images/image-viewer-special.png)

The "Simutrans display" panel at the bottom left replaces special colors with how they look in the game.

- **Player colors**: Player colors shown in the default company colors
- **Night mode**: Shown at the brightness of the darkest night in the game, with lights replaced by their night colors

Only the display changes. Copying always copies the original image.

> [!NOTE]
> If you use another image viewer extension, VS Code asks which one to use the first time you open an image. To switch, right-click the editor tab and choose "Reopen Editor With...", right-click the file in the Explorer and choose "Open With...", or select Simutrans Image Viewer from the top left of the editor.

## Pak viewer

![Pak viewer](images/pak-viewer.png)

Shows the contents of `.pak` files (read-only). The screen layout:

- **Left pane**: Node tree
- **Right pane**: Properties, image and child nodes of the selected node

Main features:

- Fields parsed with the same definitions as the Simutrans loader and shown with field names
- Image nodes shown as images
- Warnings for unknown nodes and data that could not be fully parsed

### Controls

Fully usable with the keyboard.

| Action | Description |
|---|---|
| ↑ ↓ | Move between items |
| ← → | Expand and collapse nodes |
| Tab | Switch panes |
| Ctrl+C | Copy the selected value |
| Right-click | Copy menu (name, value, image) |

Images can be copied in two ways:

- Transparent areas filled with the transparent color (`#E7FFFF`)
- Transparent areas kept transparent

## dat language support

### Syntax highlighting

![Syntax highlighting](images/dat-highlight.png)

`.dat` files are highlighted as "Simutrans dat".

### Image preview

![Image preview](images/dat-image-hover.png)

On image references such as `image[0][0]=building.0.1`:

- **Hover**: Show the image at the referenced position
- **Ctrl+click**: Open the image file

The buttons in the hover change the display:

- **Pak size**: Change the size of the cell cut from the image (`cell_size=` takes precedence if present)
- **Show / hide preview**: When hidden, the position in the image is shown instead of the image

### Name references

![Reference hover](images/dat-reference-hover.png)

Where another object is specified, such as `freight=` or `constraint[next][0]=`:

- **Hover**: Show the type and name of the target, with links to the defining files
- **F12 / Ctrl+click**: Jump to the definition (`name=`)
- **Shift+F12**: List the references to the name (also works on a `name=` value)
- **F2** (on a `name=` value): Rename the name and its references together (only references of the matching type; translation files are not changed)

Only `.dat` files in the workspace are searched. Supported keys:

| Referencing key | Target |
|---|---|
| `freight`, `freightimagetype[n]`, `inputgood[n]`, `outputgood[n]` | `obj=good` |
| `constraint[prev][n]`, `constraint[next][n]` | `obj=vehicle` |
| `smoke` | `obj=smoke` |
| `way` (tunnels) | `obj=way` |
| `fields`, `fields[n]` | `obj=field` |

### Outline and search

- **Outline** (Outline view, breadcrumbs, Ctrl+Shift+O): Shows each object's `name=` value and `obj=` type
- **Folding**: From the `name=` line to just before the next separator line
- **Ctrl+T**: Search `name=` in the workspace

### Completion

- **Templates**: at the start of a line in an object with no keys yet, choosing "Template: vehicle" or similar inserts the commonly used keys for that type. Tab moves to the next value, and typing the image file name once fills it in on every image line
- **Keys**: at the start of a line, shows the keys available for the object's `obj=` type with descriptions (subscripts are chosen from a list)
- **Values**: after `=`, shows `obj=` types, fixed words such as for `waytype=`, and names to reference
  - Names come from `name=` in the workspace and from the `diagnostics.ignoreReferences` setting
  - `constraint` also offers `none` / `any`
- **Climates**: in `climates=`, climate names are also shown after `,`

Hovering over a key shows its description and value type.

The key list follows makeobj of Simutrans Standard.

### Warnings

Open dat files show the following warnings (each kind can be turned off in the settings):

- Keys that are not read for the object's `obj=` type
- Referenced names that are not found in the workspace
- Image files that are not found, and cells outside the image
- Mismatched coupling settings (`constraint`)
  - The other vehicle has no setting (only one side is set): a warning. A comment `# @ignore-one-sided` on the line before hides it for the next line
  - The other vehicle's setting does not include this one (they cannot be coupled): an error

Quick fixes add a key or name to the ignore list (saved to "Workspace" or "User") or add `# @ignore-one-sided`.

## Settings

| Setting | Default | Description |
|---|---|---|
| `simutrans-addon-tools.pakSize` | `128` | Pak size for image previews (`cell_size=` takes precedence if present) |
| `simutrans-addon-tools.pakSizeOverrides` | `{}` | Pak size per dat file, as globs relative to the workspace folder (example: `{ "pak256/**": 256 }`) |
| `simutrans-addon-tools.imagePreview` | `true` | Whether to show the image when hovering over an image reference |
| `simutrans-addon-tools.diagnostics.unknownKey` | `true` | Whether to warn about keys that are not read |
| `simutrans-addon-tools.diagnostics.unresolvedReference` | `true` | Whether to warn about referenced names that are not found |
| `simutrans-addon-tools.diagnostics.missingImage` | `true` | Whether to warn about missing image files and cells outside the image |
| `simutrans-addon-tools.diagnostics.constraintMismatch` | `true` | Whether to show mismatched coupling settings |
| `simutrans-addon-tools.diagnostics.constraintMismatchSeverity` | `"error"` | Severity of settings with which vehicles cannot be coupled (`"error"` / `"warning"`) |
| `simutrans-addon-tools.diagnostics.ignoreKeys` | `[]` | Keys not to warn about; `obj/key` limits it to one type (example: `vehicle/catering_level`) |
| `simutrans-addon-tools.diagnostics.ignoreReferences` | `["good/Passagiere", "good/Post", "good/None"]` | Referenced names defined outside the workspace, as `obj/name`; not warned about and offered in completion (the default is the goods built into Simutrans) |

When changing them from the buttons in the hover, you can choose where to save:

- **Pak size**: "This file only", "Workspace" or "User"
- **Show / hide preview**: "Workspace" or "User"

## Requirements

- VS Code 1.117 or later

## Credits

- APD file loading: [apd-js-tools](https://github.com/G-alumi/apd-js-tools) (MIT)
  - A library for reading AzPainter `.apd` files, based on [apdtool](https://gitlab.com/azelpg/apdtool) (MIT) by Azel

## License

[MIT](LICENSE)
