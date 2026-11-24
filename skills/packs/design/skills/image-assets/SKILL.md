---
name: image-assets
description: Use when generating or editing raster images, photos, illustrations, textures, sprites, transparent cutouts, or image assets for a project, or when imagegen cannot be found or its CLI fallback needs setup.
---

# Image assets

Make image generation reachable from any harness without assuming that installing instructions installs a tool. The installed system imagegen skill owns the generation workflow; this skill locates it and makes its fallback runnable.

## Find and use imagegen

1. Run `node scripts/imagegen.mjs --locate` from this skill's directory (or invoke the script by its absolute installed path). It reports the authoritative `SKILL.md` and bundled CLI, searching `CODEX_HOME` or the user's `.codex` directory, including `.system`.
2. Read the reported `SKILL.md` directly. This avoids depending on whether the client's skill picker indexes hidden system skills. If it is missing, report the searched path; do not invent its workflow or substitute an unrelated image generator.
3. When the current harness exposes a built-in image generation tool, follow its actual tool schema and imagegen's built-in workflow. Instructions cannot enable a tool absent from the harness.
4. Use the API fallback only when the user explicitly requests CLI/API execution or confirms it after the built-in tool is unavailable or fails. Report that it requires an API key and separately billed API usage. An unavailable built-in tool alone does not authorize paid fallback.

## Easy CLI fallback

Use the [CLI helper](scripts/imagegen.mjs); it delegates to the installed upstream CLI unchanged and preserves its exit status and arguments. Run these commands from this skill's directory; paths supplied to generation are relative to the current project working directory, so use the helper's absolute path when working in another project.

```powershell
node scripts/imagegen.mjs --doctor
node scripts/imagegen.mjs --setup
node scripts/imagegen.mjs generate --prompt "A ceramic mug in soft studio light" --out output/imagegen/mug.png --dry-run
node scripts/imagegen.mjs generate --prompt "A ceramic mug in soft studio light" --out output/imagegen/mug.png
node scripts/imagegen.mjs edit --image input.png --prompt "Replace only the background; preserve the product" --out output/imagegen/edited.png
node scripts/imagegen.mjs generate-batch --help
```

`--doctor` checks the skill, Python, dependencies and whether `OPENAI_API_KEY` is set, without printing the key or making an API request. `--setup` explicitly installs `openai` and `pillow` into the selected Python environment; run it only after CLI fallback is chosen. Set the key locally, never paste it into chat. `--dry-run` needs neither the key nor installed API dependencies. Read the located skill's CLI reference for masks, batch JSONL and model controls.

Overrides: `IMAGEGEN_SKILL_ROOT` selects a complete imagegen skill directory; `IMAGEGEN_PYTHON` selects the Python executable. Otherwise the helper tries the bundled native runtime and Python on PATH. If no Python works, install Python or set that override and rerun `--doctor`.

## Project assets

Give each reference image a role; preserve explicit edit invariants and exact requested text. Inspect generated outputs for those requirements. Copy final project assets into the workspace, preserve transparency, and report saved paths and the execution route. Existing SVG/vector/code assets stay in their editable format when that meets the request. A raster mockup does not replace a working interface.
