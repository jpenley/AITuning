// A private CODEX_HOME for one Codex run, shared by micro.mjs, xreview.mjs and behave.mjs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// A private CODEX_HOME keeps ~/.codex/skills (the installed set), AGENTS.md, and MCP servers out of the sample:
// only the top-level keys of config.toml (model, reasoning) come across, plus the target's Windows sandbox.
export function codexConfig(src, windowsSandbox) {
  const lines = src.split(/\r?\n/);
  const firstTable = lines.findIndex((l) => /^\s*\[/.test(l));
  // Dotted top-level keys can still reach into a table; drop the ones that would bring MCP servers or clash with [windows].
  const top = lines.slice(0, firstTable === -1 ? lines.length : firstTable).filter((l) => !/^\s*["']?(mcp_servers|windows)["']?\s*[.=]/.test(l));
  while (top.length && !top[top.length - 1].trim()) top.pop();
  // "unelevated": the elevated Windows sandbox needs an admin setup per CODEX_HOME, a UAC prompt on every sample.
  const windows = windowsSandbox ? `\n[windows]\nsandbox = "${windowsSandbox}"\n` : '';
  return (top.length ? top.join('\n') + '\n' : '') + windows;
}

// Codex may refresh its tokens mid-run: write them back only if the real auth.json is untouched since the copy.
// Returns true when the tokens were written back.
export function writeBackAuth(srcDir, home, authAtCopy) {
  const tmp = join(home, 'auth.json');
  const orig = join(srcDir, 'auth.json');
  if (authAtCopy == null || !existsSync(tmp) || !existsSync(orig)) return false;
  const now = readFileSync(tmp, 'utf8');
  if (now === authAtCopy || readFileSync(orig, 'utf8') !== authAtCopy) return false;
  writeFileSync(orig, now);
  return true;
}

// The features to switch off (`--disable <feature>`) for a tool-less Codex run.
// Codex's -s read-only alone doesn't keep a sample tool-less: on Windows its shell commands ran and wrote in the
// workspace (%TEMP% grants the sandbox write access, and exec escalated past the sandbox). With the shell and
// exec tools off and approvals set to never, the only file tool left, apply_patch, is rejected by the sandbox.
// The other features carry side-channel tools (ChatGPT apps, image generation, browser, sub-agents).
export const CODEX_OFF = ['shell_tool', 'unified_exec', 'apps', 'plugins', 'multi_agent', 'goals', 'memories', 'image_generation', 'browser_use', 'browser_use_external', 'computer_use', 'in_app_browser'];
