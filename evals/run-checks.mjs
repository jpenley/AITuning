#!/usr/bin/env node
// Typed local check requests, with recoverable process evidence. No shell command strings.
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './lib/proc.mjs';
import { jsonSafe, oneLine } from './lib/terminal.mjs';

const fields = new Set(['version', 'command', 'cwd', 'receiptDir', 'timeout', 'clearEnvPrefixes', 'env', 'maxLogBytes']);
export async function runChecks(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.version !== 1) throw new Error('Expected a version 1 check request');
  for (const key of Object.keys(request)) if (!fields.has(key)) throw new Error(`Unknown check request field: ${key}`);
  const { command, cwd, receiptDir, timeout } = request;
  if (!Array.isArray(command) || !command.length || command.some(s => typeof s !== 'string' || s.includes('\0')) || !isAbsolute(command[0])) {
    throw new Error('command must be an argument array beginning with an absolute executable path');
  }
  if (typeof cwd !== 'string' || !isAbsolute(cwd) || !statSync(cwd).isDirectory()) throw new Error('cwd must be an existing absolute directory');
  if (typeof receiptDir !== 'string' || !isAbsolute(receiptDir)) throw new Error('receiptDir must be an absolute new directory');
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 86_400_000) throw new Error('timeout must be 1..86400000 milliseconds');
  if (request.env != null && (typeof request.env !== 'object' || Array.isArray(request.env)
    || Object.entries(request.env).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
      || (value !== null && (typeof value !== 'string' || value.includes('\0')))))) {
    throw new Error('env must contain variable names with NUL-free string values or null removals');
  }
  const result = await runProcess(command, { cwd, receiptDir, timeout, env: request.env,
    clearEnvPrefixes: request.clearEnvPrefixes, maxLogBytes: request.maxLogBytes });
  const receipt = readFileSync(join(receiptDir, 'receipt.json'), 'utf8');
  return { result, receipt: JSON.parse(receipt) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, path, ...extra] = process.argv.slice(2);
    if (!['run', 'status'].includes(mode) || !path || extra.length) throw new Error('usage: node evals/run-checks.mjs run REQUEST.json | status RECEIPT_DIRECTORY');
    if (mode === 'status') {
      const receipt = JSON.parse(readFileSync(join(path, 'receipt.json'), 'utf8'));
      if (receipt.version !== 1 || !['starting', 'running', 'completed', 'timed-out', 'failed-to-start', 'failed'].includes(receipt.state)) throw new Error('Invalid execution receipt');
      process.stdout.write(jsonSafe(receipt) + '\n');
    } else {
      const request = JSON.parse(readFileSync(path, 'utf8'));
      const { result, receipt } = await runChecks(request);
      process.stdout.write(jsonSafe(receipt) + '\n');
      if (result.code === -1) process.stderr.write(oneLine(result.err) + '\n');
      process.exitCode = result.code === -1 ? 2 : result.code === 0 && !result.timedOut ? 0 : 1;
    }
  } catch (error) {
    process.stderr.write(oneLine(error.message) + '\n');
    process.stdout.write(jsonSafe({ ok: false, error: error.message }) + '\n');
    process.exitCode = 2;
  }
}
