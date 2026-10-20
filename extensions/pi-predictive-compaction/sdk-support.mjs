import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installPredictiveHandoff } from './sdk-handoff.mjs';
import { installPredictiveHandoff as legacyHandoff } from './legacy/sdk-handoff-v1.mjs';
import { installPredictiveHandoff as legacyHandoffV2 } from './legacy/sdk-handoff-v2.mjs';

export const SDK_VERSION = 1;
const originals = {
  'dist/modes/interactive/components/footer.js': '55b8492fb4ccda5e8f53a3a1882f091157dd85e08c9577db2f05e36020b22b88',
  'dist/index.js': '4569157e6038be9840fa514db4b00a27fd0be9e3622cc7b49a281de6c027d7ff',
  'dist/index.d.ts': '2f2c87d877a6502a11bcdbaf3be62c12a154ab87d795e954d44c50833d0efbcd',
  'dist/core/agent-session.js': 'd0b4545a5da7fe97aa699269e64e27b37ee2fb5b7985efb1c0a66fc3d1883b52',
  'dist/core/extensions/runner.js': '0e659fb4338069d91c4d0a3b032b51bf8d179a99e6417bc3e39e59b672aaec76',
  'dist/core/extensions/runner.d.ts': '24072380e2d884f2a8ecd148f374ee901e35e79f2bb6370f867bcce3523a9e1e',
  'dist/core/extensions/types.d.ts': 'c5038d9410cfb13f5be391f46f13de338bc46ab4c9a7d064f7b962c0dc4a807c',
  'dist/bundle/chunks/chunk-66G7ITPS.js': '0426becd43ff630d8c9129f5606b23d0a43d5c115334884c77aa6595035c8690',
  'dist/bundle/chunks/chunk-AI62ELJX.js': 'bb8419e86446812a68996531bab631ebad30703079fa41f7c2852ae087f53e63',
  'dist/bundle/index.js': '76ab31db6a9a13dc1d347c5a344190d74fafba9f77f4ed3d5d6760b8eb88b741',
};
export const sha = value => createHash('sha256').update(value).digest('hex');

function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('SDK patch anchor missing or ambiguous: ' + before.slice(0, 80));
  return text.replace(before, after);
}

// Legacy options reproduce previously shipped patches for guarded upgrades.
export function patchText(path, source, { inlineFooter = true, handoff = true, handoffVersion = 3 } = {}) {
  let text = source;
  if (path === 'dist/index.js' || path === 'dist/index.d.ts') {
    text = replaceOnce(text, 'getLastAssistantUsage, prepareBranchEntries,', 'getLastAssistantUsage, prepareCompaction, prepareBranchEntries,');
    text += path.endsWith('.d.ts') ? '\nexport declare const PREDICTIVE_COMPACTION_SDK_VERSION = 1;\n' : '\nexport const PREDICTIVE_COMPACTION_SDK_VERSION = 1;\n';
  } else if (path === 'dist/bundle/chunks/chunk-66G7ITPS.js') {
    text = replaceOnce(text, 'getContextUsageFn=()=>{};', 'getCompactionSettingsFn;createUsageRecorderFn;getContextUsageFn=()=>{};');
    text = replaceOnce(text, 'this.getContextUsageFn=contextActions.getContextUsage,', 'this.getCompactionSettingsFn=contextActions.getCompactionSettings,this.createUsageRecorderFn=contextActions.createUsageRecorder,this.getContextUsageFn=contextActions.getContextUsage,');
    text = replaceOnce(text, 'getContextUsage:()=>(runner.assertActive(),runner.getContextUsageFn()),', 'getCompactionSettings:()=>{runner.assertActive();if(!runner.getCompactionSettingsFn)throw new Error("Compaction SDK not bound");return runner.getCompactionSettingsFn()},createUsageRecorder:()=>{runner.assertActive();if(!runner.createUsageRecorderFn)throw new Error("Usage SDK not bound");return runner.createUsageRecorderFn()},getContextUsage:()=>(runner.assertActive(),runner.getContextUsageFn()),');
    text = replaceOnce(text, 'getContextUsage:()=>this.getContextUsage(),', 'getCompactionSettings:()=>this.settingsManager.getCompactionSettings(this.model),createUsageRecorder:()=>{const manager=this.sessionManager;return(kind,provider,model,usage,note)=>manager.appendUsage(kind,provider,model,usage,note)},getContextUsage:()=>this.getContextUsage(),');
    text = replaceOnce(text, 'compact,collectEntriesForBranchSummary,prepareBranchEntries,', 'compact,prepareCompaction,collectEntriesForBranchSummary,prepareBranchEntries,');
  } else if (path === 'dist/bundle/chunks/chunk-AI62ELJX.js') {
    text = replaceOnce(text, 'parseSkillBlock,prepareBranchEntries,', 'parseSkillBlock,prepareCompaction,prepareBranchEntries,');
    text = replaceOnce(text, 'prepareBranchEntries:()=>prepareBranchEntries,', 'PREDICTIVE_COMPACTION_SDK_VERSION:()=>1,prepareCompaction:()=>prepareCompaction,prepareBranchEntries:()=>prepareBranchEntries,');
  } else if (path === 'dist/bundle/index.js') {
    if (text.split('parseSkillBlock,prepareBranchEntries,').length !== 3) throw new Error('Bundle SDK import/export anchor changed');
    text = text.replaceAll('parseSkillBlock,prepareBranchEntries,', 'parseSkillBlock,prepareCompaction,prepareBranchEntries,');
    text += '\nexport const PREDICTIVE_COMPACTION_SDK_VERSION = 1;\n';
  } else if (path === 'dist/core/agent-session.js') {
    text = replaceOnce(text, '            getContextUsage: () => this.getContextUsage(),', `            getCompactionSettings: () => this.settingsManager.getCompactionSettings(this.model),
            createUsageRecorder: () => {
                const manager = this.sessionManager;
                return (kind, provider, model, usage, note) => manager.appendUsage(kind, provider, model, usage, note);
            },
            getContextUsage: () => this.getContextUsage(),`);
  } else if (path === 'dist/core/extensions/runner.js') {
    text = replaceOnce(text, '    getContextUsageFn = () => undefined;', `    getCompactionSettingsFn;
    createUsageRecorderFn;
    getContextUsageFn = () => undefined;`);
    text = replaceOnce(text, '        this.getContextUsageFn = contextActions.getContextUsage;', `        this.getCompactionSettingsFn = contextActions.getCompactionSettings;
        this.createUsageRecorderFn = contextActions.createUsageRecorder;
        this.getContextUsageFn = contextActions.getContextUsage;`);
    text = replaceOnce(text, '            getContextUsage: () => {', `            getCompactionSettings: () => {
                runner.assertActive();
                if (!runner.getCompactionSettingsFn) throw new Error("Compaction SDK not bound");
                return runner.getCompactionSettingsFn();
            },
            createUsageRecorder: () => {
                runner.assertActive();
                if (!runner.createUsageRecorderFn) throw new Error("Usage SDK not bound");
                return runner.createUsageRecorderFn();
            },
            getContextUsage: () => {`);
  } else if (path === 'dist/core/extensions/runner.d.ts') {
    text = replaceOnce(text, '    private getContextUsageFn;', '    private getCompactionSettingsFn;\n    private createUsageRecorderFn;\n    private getContextUsageFn;');
  } else if (path === 'dist/core/extensions/types.d.ts') {
    text = replaceOnce(text, 'import type { CompactionPreparation, CompactionResult }', 'import type { CompactionPreparation, CompactionResult, CompactionSettings }');
    text = replaceOnce(text, '    getContextUsage(): ContextUsage | undefined;', `    getCompactionSettings?(): CompactionSettings;
    /** Capture a native usage writer bound to this session, safe after session replacement. */
    createUsageRecorder?(): (kind: string, provider: string, model: string, usage: Usage, note?: string) => ReturnType<SessionManager["appendUsage"]>;
    getContextUsage(): ContextUsage | undefined;`);
    text = replaceOnce(text, '    getContextUsage: () => ContextUsage | undefined;', `    getCompactionSettings?: () => CompactionSettings;
    createUsageRecorder?: () => (kind: string, provider: string, model: string, usage: Usage, note?: string) => ReturnType<SessionManager["appendUsage"]>;
    getContextUsage: () => ContextUsage | undefined;`);
  } else if (path !== 'dist/modes/interactive/components/footer.js') throw new Error('Unknown SDK patch file: ' + path);
  if (inlineFooter && path === 'dist/modes/interactive/components/footer.js') {
    text = replaceOnce(text, 'this.autoCompactEnabled ? " (auto)" : ""', 'this.autoCompactEnabled ? (this.footerData.getExtensionStatuses().get("predictive-compaction") === "predict" ? " (predict)" : " (auto)") : ""');
    text = replaceOnce(text, 'const extensionStatuses = this.footerData.getExtensionStatuses();', 'const extensionStatuses = new Map([...this.footerData.getExtensionStatuses()].filter(([key]) => key !== "predictive-compaction"));');
  } else if (inlineFooter && path === 'dist/bundle/chunks/chunk-66G7ITPS.js') {
    text = replaceOnce(text, 'autoIndicator=this.autoCompactEnabled?" (auto)":""', 'autoIndicator=this.autoCompactEnabled?(this.footerData.getExtensionStatuses().get("predictive-compaction")==="predict"?" (predict)":" (auto)"):""');
    text = replaceOnce(text, 'extensionStatuses=this.footerData.getExtensionStatuses();', 'extensionStatuses=new Map([...this.footerData.getExtensionStatuses()].filter(([key])=>key!=="predictive-compaction"));');
  }
  if (handoff) {
    if (path === 'dist/core/agent-session.js' || path === 'dist/bundle/chunks/chunk-66G7ITPS.js') {
      const bundled = path.includes('/bundle/');
      const anchor = bundled ? 'this._installAgentForcedPromptProjection(),' : 'this._installAgentForcedPromptProjection();';
      text = replaceOnce(text, anchor, anchor + (bundled ? 'installPredictiveHandoff(this,estimateProjectedContextTokens),' : '\n        installPredictiveHandoff(this, estimateProjectedContextTokens);'));
      const action = bundled ? 'getCompactionSettings:()=>this.settingsManager' : 'getCompactionSettings: () => this.settingsManager';
      const setter = bundled ? 'setPredictiveCompactionEnabled:enabled=>this._setPredictiveCompactionEnabled(enabled),' : 'setPredictiveCompactionEnabled: enabled => this._setPredictiveCompactionEnabled(enabled),\n            ';
      text = replaceOnce(text, action, setter + action);
      const usage = bundled ? 'getContextUsage:()=>this.getContextUsage(),' : 'getContextUsage: () => this.getContextUsage(),';
      text = replaceOnce(text, usage, bundled ? 'getContextUsage:()=>this._getPredictiveCompactionUsage()??this.getContextUsage(),' : 'getContextUsage: () => this._getPredictiveCompactionUsage() ?? this.getContextUsage(),');
      if (handoffVersion <= 2 && bundled) {
        const route = 'return this._exceedsCompactionThreshold(route.model,projection)&&';
        text = replaceOnce(text, route, 'return this._predictiveHandoffEnabled?(await this._predictiveHandoff(route.model,signal),{previous,context}=await prepare()):this._exceedsCompactionThreshold(route.model,projection)&&');
      } else if (handoffVersion <= 2) {
        const route = '            if (this._exceedsCompactionThreshold(route.model, projection)) {';
        text = replaceOnce(text, route, '            if (this._predictiveHandoffEnabled) {\n                await this._predictiveHandoff(route.model, signal);\n                ({ previous, context } = await prepare());\n            } else if (this._exceedsCompactionThreshold(route.model, projection)) {');
      } else if (bundled) {
        const route = 'return this._exceedsCompactionThreshold(route.model,projection)&&(await this._runAutoCompaction("threshold",!1),';
        text = replaceOnce(text, route, 'return signal?.throwIfAborted(),this._exceedsCompactionThreshold(route.model,projection)&&(await this._withPredictiveCompactionModel(route.model,()=>this._runAutoCompaction("threshold",!1)),');
      } else {
        const route = '            if (this._exceedsCompactionThreshold(route.model, projection)) {\n                await this._runAutoCompaction("threshold", false);';
        text = replaceOnce(text, route, '            signal?.throwIfAborted();\n            if (this._exceedsCompactionThreshold(route.model, projection)) {\n                await this._withPredictiveCompactionModel(route.model, () => this._runAutoCompaction("threshold", false));');
      }
      if (handoffVersion >= 3) {
        const settings = bundled ? 'getCompactionSettings:()=>this.settingsManager.getCompactionSettings(this.model),' : 'getCompactionSettings: () => this.settingsManager.getCompactionSettings(this.model),';
        text = replaceOnce(text, settings, bundled ? 'getCompactionSettings:()=>this._getPredictiveCompactionSettings(),' : 'getCompactionSettings: () => this._getPredictiveCompactionSettings(),');
      }
      text += '\n' + (handoffVersion === 1 ? legacyHandoff : handoffVersion === 2 ? legacyHandoffV2 : installPredictiveHandoff).toString() + '\n';
    }
    if (path === 'dist/core/extensions/runner.js' || path === 'dist/bundle/chunks/chunk-66G7ITPS.js') {
      const bundled = path.includes('/bundle/');
      text = replaceOnce(text, 'createUsageRecorderFn;', 'createUsageRecorderFn;setPredictiveCompactionEnabledFn;');
      const binding = bundled ? 'this.getCompactionSettingsFn=contextActions.getCompactionSettings,' : 'this.getCompactionSettingsFn = contextActions.getCompactionSettings;';
      text = replaceOnce(text, binding, binding + (bundled ? 'this.setPredictiveCompactionEnabledFn=contextActions.setPredictiveCompactionEnabled,' : '\n        this.setPredictiveCompactionEnabledFn = contextActions.setPredictiveCompactionEnabled;'));
      const context = bundled ? 'getCompactionSettings:()=>{' : 'getCompactionSettings: () => {';
      const setter = bundled ? 'setPredictiveCompactionEnabled:enabled=>{runner.assertActive();runner.setPredictiveCompactionEnabledFn(enabled)},' : 'setPredictiveCompactionEnabled: enabled => { runner.assertActive(); runner.setPredictiveCompactionEnabledFn(enabled); },\n            ';
      text = replaceOnce(text, context, setter + context);
    }
    if (path === 'dist/core/extensions/runner.d.ts') text = replaceOnce(text, '    private createUsageRecorderFn;', '    private createUsageRecorderFn;\n    private setPredictiveCompactionEnabledFn;');
    if (path === 'dist/core/extensions/types.d.ts') {
      text = replaceOnce(text, '    getCompactionSettings?(): CompactionSettings;', '    setPredictiveCompactionEnabled?(enabled: boolean): void;\n    getCompactionSettings?(): CompactionSettings;');
      text = replaceOnce(text, '    getCompactionSettings?: () => CompactionSettings;', '    setPredictiveCompactionEnabled?: (enabled: boolean) => void;\n    getCompactionSettings?: () => CompactionSettings;');
    }
  }
  return text;
}

export function planSdkSupport(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (pkg.name !== '@earendil-works/pi-coding-agent' || pkg.version !== '1.3.0') throw new Error('SDK support requires Pi 1.3.0');
  return Object.entries(originals).map(([path, hash]) => {
    const file = join(root, path), current = readFileSync(file, 'utf8');
    if (sha(current) === hash) return { path, before: current, previous: current, after: patchText(path, current), installed: false, upgrade: false };
    const backup = join(root, '.predictive-compaction-sdk-backup', path);
    if (!existsSync(backup)) throw new Error('SDK source hash mismatch: ' + path);
    const source = readFileSync(backup, 'utf8');
    if (sha(source) !== hash) throw new Error('SDK backup hash mismatch: ' + path);
    const after = patchText(path, source), installed = current === after;
    const previousPatches = [true, false].flatMap(inlineFooter => [
      patchText(path, source, { inlineFooter, handoff: false }),
      patchText(path, source, { inlineFooter, handoffVersion: 1 }),
      patchText(path, source, { inlineFooter, handoffVersion: 2 }),
    ]);
    if (!installed && !previousPatches.includes(current)) throw new Error('SDK modified after patch: ' + path);
    return { path, before: source, previous: current, after, installed, upgrade: !installed };
  });
}

export function applySdkSupport(root) {
  const plan = planSdkSupport(root); // Validate EVERY file before the first write.
  const written = [];
  try {
    for (const item of plan.filter(x => !x.installed)) {
      const file = join(root, item.path), backup = join(root, '.predictive-compaction-sdk-backup', item.path);
      mkdirSync(resolve(backup, '..'), { recursive: true });
      if (existsSync(backup) && readFileSync(backup, 'utf8') !== item.before) throw new Error('Conflicting SDK backup: ' + item.path);
      if (!existsSync(backup)) copyFileSync(file, backup);
      writeFileSync(file + '.predictive-tmp', item.after);
      renameSync(file + '.predictive-tmp', file);
      written.push(item);
    }
  } catch (error) {
    const failures = [];
    for (const item of written.reverse()) {
      try { writeFileSync(join(root, item.path), item.previous); } catch (rollback) { failures.push(rollback); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], 'SDK patch failed and rollback was incomplete');
    throw error;
  }
  return plan.map(item => ({ path: item.path, before: sha(item.before), after: sha(item.after) }));
}

export function restoreSdkSupport(root) {
  const plan = planSdkSupport(root), written = [];
  try {
    for (const item of plan.filter(x => x.installed || x.upgrade)) {
      const file = join(root, item.path);
      writeFileSync(file + '.predictive-tmp', item.before);
      renameSync(file + '.predictive-tmp', file);
      written.push(item);
    }
  } catch (error) {
    const failures = [];
    for (const item of written.reverse()) {
      try { writeFileSync(join(root, item.path), item.previous); } catch (rollback) { failures.push(rollback); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], 'SDK restore failed and rollback was incomplete');
    throw error;
  }
  return plan.map(item => ({ path: item.path, restored: item.installed || item.upgrade, sha256: sha(item.before) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, root] = process.argv.slice(2);
    if (!['check', 'apply', 'restore'].includes(mode) || !root) throw new Error('Usage: node sdk-support.mjs check|apply|restore <pi-package-root>');
    const files = mode === 'apply' ? applySdkSupport(root) : mode === 'restore' ? restoreSdkSupport(root) : planSdkSupport(root).map(x => ({ path: x.path, installed: x.installed }));
    process.stdout.write(JSON.stringify({ ok: true, mode, sdkVersion: SDK_VERSION, files }) + '\n');
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
