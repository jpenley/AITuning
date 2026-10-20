// AITuning elicitation qualification fixture. Generated only in an isolated Pi checkout.
import { expect, it } from 'vitest';
import { validateElicitationRequest, validateElicitationResponse } from '__NATIVE_VALIDATOR__';
import { parseRequest, validateContent } from '__COMPANION_VALIDATOR__';
import { contractCases } from '__CONTRACT_CASES__';

for (const c of contractCases) {
  it(`native and companion share form v1: ${c.name}`, () => {
    let native, companion;
    try { native = validateElicitationRequest(c.request); } catch { native = false; }
    try { companion = parseRequest({ server: 'contract-test', source: 'fixture', request: c.request }); } catch { companion = false; }
    expect([Boolean(native), Boolean(companion)]).toEqual([c.supported, c.supported]);
    for (const v of c.values ?? []) {
      let companionValid = true;
      try { validateContent(companion, v.content); } catch { companionValid = false; }
      expect([native.validateContent(v.content), companionValid]).toEqual([v.valid, v.valid]);
      let responseValid = true;
      try { validateElicitationResponse({ action: 'accept', content: v.content }, native.validateContent); }
      catch { responseValid = false; }
      expect(responseValid).toBe(v.valid);
    }
  });
}
