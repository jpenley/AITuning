// Tool-less OpenAI-compatible samples shared by micro and the decision comparators.
import { sha256 } from './provenance.mjs';

export async function chat(target, prompt, timeout) {
  const key = target.apiKeyEnv ? process.env[target.apiKeyEnv] : null;
  const started = Date.now();
  const body = { model: target.apiModel ?? target.model, temperature: 0,
    messages: [{ role: 'user', content: prompt }], max_tokens: target.output ?? 4096,
    ...(target.effort ? { reasoning_effort: target.effort } : {}), ...(target.extraBody ?? {}) };
  // extraBody keeps its existing override semantics. Record effective wire identity
  // separately from the target's top-level settings, without copying arbitrary fields.
  const request = { model: body.model ?? null, effort: body.reasoning_effort ?? null, sha256: sha256(body) };
  try {
    const response = await fetch(`${String(target.baseURL).replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    // Provider error bodies may reflect credentials or private inputs; status suffices.
    if (!response.ok) { await response.body?.cancel(); throw new Error(`chat HTTP ${response.status}`); }
    let raw = '';
    let bytes = 0;
    const decoder = new TextDecoder();
    for await (const part of response.body) {
      bytes += part.length;
      if (bytes > 32 * 1024 * 1024) throw new Error('chat response exceeds 32 MiB');
      raw += decoder.decode(part, { stream: true });
    }
    raw += decoder.decode();
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('chat response is not JSON'); }
    const choice = data.choices?.[0];
    if (data.error || typeof choice?.message?.content !== 'string' || choice.finish_reason !== 'stop') {
      throw Object.assign(new Error(`chat response incomplete (${choice?.finish_reason ?? 'no final answer'})`), { raw });
    }
    return { text: choice.message.content, raw, request, usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 }, apiMs: Date.now() - started, costUsd: null };
  } catch (e) { e.request = request; throw e; }
}
