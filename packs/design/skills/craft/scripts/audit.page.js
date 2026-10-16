// Runs inside the page (injected by detect.mjs). Measures what the browser actually rendered and returns findings.
// Self-contained: no imports, only DOM APIs. `opts` = { mobile: boolean, tokens: { colors: string[], fonts: string[] } | null }.
// Severities: "error" breaks the floor, "warn" is likely wrong, "tell" is a pattern common in AI-made UI (a reason to
// look again, never a ban).
(opts) => {
  const findings = [];
  const add = (severity, rule, detail, el, extra) => findings.push({ severity, rule, detail, where: el ? describe(el) : '', ...(extra || {}) });
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const text = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };

  // Colour: let a canvas parse any CSS colour (rgb, hsl, oklch, color()) into sRGB bytes.
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  ctx.canvas.width = ctx.canvas.height = 1;
  const cache = new Map();
  const rgba = (css) => {
    if (cache.has(css)) return cache.get(css);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const v = { r, g, b, a: a / 255 };
    cache.set(css, v);
    return v;
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const hsl = ({ r, g, b }) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    return { h: (h + 360) % 360, s, l };
  };
  const cs = (el) => getComputedStyle(el);
  // The colour behind an element's text, composited through ancestors; null when an image or gradient is in the way.
  const background = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = cs(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = rgba(s.backgroundColor);
      if (c.a > 0) layers.push(c);
      if (c.a >= 1) break;
    }
    return layers.reverse().reduce((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 });
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : cs(el).visibility !== 'hidden';
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();

  const EMOJI = /^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]{1,4}$/u;
  const isEmoji = (el) => el.children.length === 0 && EMOJI.test(el.textContent || '') && /\p{Extended_Pictographic}/u.test(el.textContent);
  const hasIcon = (el) => !!el.querySelector('svg,img,i,[class*=icon]') || [...el.querySelectorAll('*')].some(isEmoji);
  const all = [...document.body.querySelectorAll('*')].filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg'].includes(el.tagName) && !el.closest('svg'));
  const textEls = all.filter((el) => ownText(el) && visible(el));

  // Stress mode (detect.mjs --stress): content the page wasn't designed around. "long" makes short labels about 40%
  // longer (what translation does) and puts a long unbroken name in cells; "rtl" flips the page right-to-left. Then
  // only what breaks is reported: sideways scroll, clipped text, text spilling out of its box.
  if (opts.stress) {
    if (opts.stress === 'rtl') document.documentElement.dir = 'rtl';
    else for (const el of textEls) {
      const t = ownText(el);
      if (t.length > 60) continue;
      const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      if (!node) continue;
      node.textContent = el.matches('td,th,[class*=name],[class*=user],[class*=title]') && t.length < 30
        ? `${node.textContent} Maximiliane-Wolfeschlegelsteinhausen`
        : `${node.textContent} ${Array(Math.max(1, Math.ceil((t.length * 0.4) / 12))).fill('Übersetzung').join(' ')}`;
    }
    const out = [];
    const vw = opts.width || innerWidth;
    const sw = document.scrollingElement.scrollWidth;
    if (sw > vw + 1) out.push({ severity: 'warn', rule: 'stress-overflow', detail: `with ${opts.stress === 'rtl' ? 'right-to-left text' : 'longer text'} the page is ${sw}px wide in a ${vw}px viewport`, where: '' });
    let clipped = 0, spilled = 0, firstC = null, firstS = null;
    // Visually hidden text (the sr-only pattern: 1px wide, clipped on purpose) is for screen readers; skip it.
    const srOnly = (el) => { const r = el.getBoundingClientRect(), s = cs(el); return r.width <= 2 || r.height <= 2 || (s.clip && s.clip !== 'auto') || /inset\(50%\)/.test(s.clipPath); };
    for (const el of textEls.filter((e) => !srOnly(e))) {
      const s = cs(el);
      if (/hidden|clip/.test(s.overflowX + s.overflow) && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis' && !el.closest('[class*=scroll],pre,code')) { clipped++; firstC ??= el; }
      const p = el.parentElement, r = el.getBoundingClientRect(), pr = p?.getBoundingClientRect();
      if (p && pr && cs(p).overflowX === 'visible' && (r.right > pr.right + 2 || r.left < pr.left - 2) && cs(el).position !== 'absolute') { spilled++; firstS ??= el; }
    }
    if (clipped) out.push({ severity: 'warn', rule: 'stress-clipped', detail: `${clipped} element(s) cut their text off with no ellipsis when it gets longer`, where: describe(firstC) });
    if (spilled) out.push({ severity: 'warn', rule: 'stress-spill', detail: `${spilled} element(s) spill their text outside their box when it gets longer`, where: describe(firstS) });
    return { findings: out, sizes: [], viewport: vw, inventory: null };
  }

  // ---------- floor ----------
  const sizes = new Set();
  const contrastSeen = new Set();
  for (const el of textEls) {
    const s = cs(el);
    const px = parseFloat(s.fontSize);
    sizes.add(Math.round(px));
    const bold = parseInt(s.fontWeight, 10) >= 700;
    const large = px >= 24 || (bold && px >= 18.66);
    const bg = background(el);
    // WCAG 1.4.3 exempts inactive controls: a disabled button may be low-contrast on purpose.
    const inactive = el.closest(':disabled, [aria-disabled="true"], fieldset:disabled');
    if (bg && !inactive) {
      const fg = over(rgba(s.color), bg);
      const cr = ratio(fg, bg);
      const need = large ? 3 : 4.5;
      const key = `${s.color}|${bg.r},${bg.g},${bg.b}|${large}`;
      if (cr < need && !contrastSeen.has(key)) { contrastSeen.add(key); add('error', 'contrast', `${(Math.floor(cr * 100) / 100).toFixed(2)}:1, needs ${need}:1 (${large ? 'large' : 'normal'} text, ${s.color} on rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}))`, el); }
    }
    // Reading text has a 12px floor; UI chrome (badges, labels, counters) an 11px one.
    const reading = /^(P|LI|TD|DD|BLOCKQUOTE|LABEL)$/.test(el.tagName) || ownText(el).length > 40;
    if (px < 11 || (reading && px < 12)) add('error', 'text-size', `${px}px ${reading ? 'reading text; 12px' : 'text; 11px for labels and badges, 12px'} is the floor`, el);
    else if (px < 12) add('warn', 'text-size', `${px}px label; fine for a short badge, too small for anything read`, el);
    else if (px < 14 && /^(P|LI|TD|DD|BLOCKQUOTE)$/.test(el.tagName) && ownText(el).length > 60) add('warn', 'text-size', `${px}px body text; 16px reads comfortably, 14px is the lowest for long text`, el);
    if (/^(P|LI|DD|BLOCKQUOTE)$/.test(el.tagName) && el.innerText.length > 160) {
      ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const ch = ctx.measureText('0').width || px / 2;
      const inner = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      const chars = inner / ch;
      if (chars > 80) add('warn', 'line-length', `about ${Math.round(chars)}ch per line; 45–75ch reads best (cap it with max-width, e.g. 65ch)`, el);
      const lh = s.lineHeight === 'normal' ? 1.2 : parseFloat(s.lineHeight) / px;
      if (lh < 1.3 && el.getBoundingClientRect().height > px * lh * 1.8) add('warn', 'leading', `line-height ${lh.toFixed(2)}; long text needs about 1.4–1.7`, el);
    }
  }
  if (sizes.size > 8) add('warn', 'type-scale', `${sizes.size} distinct font sizes (${[...sizes].sort((a, b) => a - b).join(', ')}px); a scale of 6–8 steps reads as deliberate`);

  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible);
  const h1s = heads.filter((h) => h.tagName === 'H1').length;
  if (h1s !== 1) add('warn', 'headings', h1s ? `${h1s} h1 elements; one page title reads clearly` : 'no h1: the page has no title for assistive tech');
  for (let i = 1; i < heads.length; i++) {
    const a = +heads[i - 1].tagName[1], b = +heads[i].tagName[1];
    if (b > a + 1) add('warn', 'headings', `h${a} followed by h${b}: a skipped level`, heads[i]);
  }

  const interactive = all.filter((el) => el.matches('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[tabindex]:not([tabindex="-1"])') && visible(el));
  if (opts.mobile) {
    // WCAG 2.5.8: a target under 24×24 passes when a 24px square centred on it touches no other target.
    const rects = interactive.map((el) => [el, el.getBoundingClientRect()]);
    for (const [el, r] of rects) {
      const inline = el.tagName === 'A' && el.parentElement && /^(P|LI|TD|SPAN|DD)$/.test(el.parentElement.tagName) && ownText(el.parentElement).length > 0;
      if (inline || (r.width >= 24 && r.height >= 24)) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const box = { left: cx - 12, right: cx + 12, top: cy - 12, bottom: cy + 12 };
      const crowded = rects.some(([o, q]) => o !== el && !o.contains(el) && !el.contains(o) && q.left < box.right && q.right > box.left && q.top < box.bottom && q.bottom > box.top);
      if (crowded) add('error', 'tap-target', `${Math.round(r.width)}×${Math.round(r.height)}px and crowded by a neighbour; 24×24 (or 24px of clear space) is the minimum, 44×44 is comfortable`, el);
    }
    // Chrome's mobile emulation widens innerWidth to fit overflowing content, so compare against the requested width.
    const vw = opts.width || innerWidth;
    const sw = document.scrollingElement.scrollWidth;
    if (sw > vw + 1) {
      const widest = all.filter(visible).map((el) => [el, el.getBoundingClientRect().right]).sort((x, y) => y[1] - x[1])[0];
      add('error', 'overflow', `page is ${sw}px wide in a ${vw}px viewport: it scrolls sideways`, widest?.[0]);
    }
  }
  // A visible focus indicator: focus each control and compare what changed.
  const snap = (el) => { const s = cs(el); return [s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? s.outlineStyle + s.outlineWidth + s.outlineColor : '', s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine, s.color].join('|'); };
  let noFocus = 0;
  let firstNoFocus = null;
  for (const el of interactive.slice(0, 30)) {
    const before = snap(el);
    try { el.focus({ focusVisible: true, preventScroll: true }); } catch { continue; }
    if (document.activeElement !== el) continue;
    const after = snap(el);
    el.blur();
    if (before === after) { noFocus++; firstNoFocus ??= el; }
  }
  if (noFocus) add('error', 'focus', `${noFocus} control(s) show no visible change on keyboard focus`, firstNoFocus);
  for (const img of all.filter((el) => el.tagName === 'IMG' && !el.hasAttribute('alt'))) add('warn', 'alt', 'image with no alt attribute (use alt="" if decorative)', img);
  // Checks from the Web Interface Guidelines (Vercel Labs, MIT) that hold in any stack and can be measured here.
  const vp = document.querySelector('meta[name=viewport]')?.content ?? '';
  if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(?:\.0*)?\b/i.test(vp)) add('error', 'zoom-disabled', `the viewport meta ("${vp}") stops people zooming; remove user-scalable=no and maximum-scale`);
  const named = (el) => (el.getAttribute('aria-label') || '').trim() || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent.trim()) || (el.getAttribute('title') || '').trim();
  for (const c of all.filter((el) => el.matches('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]),select,textarea') && visible(el))) {
    const labelled = (c.id && document.querySelector(`label[for="${CSS.escape(c.id)}"]`)) || c.closest('label') || named(c);
    if (!labelled) add('error', 'unlabelled-control', 'a form control with no label (a <label for>, a wrapping label, or aria-label); a placeholder is not a label', c);
    const hint = `${c.name} ${c.id} ${c.getAttribute('autocomplete') ?? ''} ${c.placeholder ?? ''}`.toLowerCase();
    if (c.tagName === 'INPUT' && c.type === 'text' && /e-?mail|phone|tel\b|mobile|url|website/.test(hint)) add('warn', 'input-type', `an ${/mail/.test(hint) ? 'email' : /url|website/.test(hint) ? 'url' : 'tel'} field with type="text": the right type brings the right mobile keyboard and validation`, c);
    if (c.tagName === 'INPUT' && (['email', 'password', 'tel'].includes(c.type) || /e-?mail|password|phone/.test(hint)) && !c.hasAttribute('autocomplete')) add('warn', 'autocomplete', 'a sign-in or contact field with no autocomplete attribute: password managers and autofill need it', c);
  }
  for (const b of all.filter((el) => el.matches('button,a[href],[role=button]') && visible(el) && !(el.innerText || '').trim() && !named(el) && !el.querySelector('img[alt]:not([alt=""])'))) add('error', 'unnamed-control', 'an icon-only control with no accessible name; add aria-label', b);
  for (const d of all.filter((el) => el.matches('div[onclick],span[onclick],li[onclick],td[onclick]') && visible(el))) add('warn', 'div-button', 'a click handler on a non-interactive element: keyboard users can\'t reach it; use a <button> or <a>', d);
  const noSize = all.filter((el) => el.tagName === 'IMG' && visible(el) && !(el.hasAttribute('width') && el.hasAttribute('height')) && !/aspect-ratio/.test(el.getAttribute('style') || '') && cs(el).aspectRatio === 'auto');
  if (noSize.length) add('warn', 'image-size', `${noSize.length} image(s) with no width and height (or aspect-ratio): the layout jumps as they load`, noSize[0]);
  // Document checks (from chrome-devtools-mcp's a11y and LCP snippets, Apache-2.0).
  if (!(document.documentElement.getAttribute('lang') || '').trim()) add('error', 'html-lang', `<html> has ${document.documentElement.hasAttribute('lang') ? 'an empty' : 'no'} lang attribute: screen readers can't pick the language to read it in (WCAG 3.1.1); add lang="en" or the page's language`);
  if (!document.title.trim()) add('error', 'title', `the page has ${document.querySelector('title') ? 'an empty' : 'no'} <title>: tabs, bookmarks, and screen readers have nothing to call it (WCAG 2.4.2)`);
  // A lazy image in the first screen waits for layout before it loads, which delays the largest paint. Lazy images that
  // haven't loaded may have no size yet, so the box's position is used, not visible().
  const firstScreen = all.filter((el) => el.tagName === 'IMG' && el.loading === 'lazy' && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true })) && (() => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom >= 0 && r.left < innerWidth && r.right >= 0; })());
  if (firstScreen.length) add('warn', 'lazy-above-fold', `${firstScreen.length} image(s) in the first screen with loading="lazy": they load late and can be the largest paint; drop loading="lazy" there (add fetchpriority="high" to the hero)`, firstScreen[0]);
  const JS = /^(|text\/javascript|application\/javascript|text\/ecmascript|application\/ecmascript)$/i;
  const blocking = [...document.head.querySelectorAll('script[src]:not([async]):not([defer])')].filter((s) => JS.test((s.getAttribute('type') || '').trim()));
  if (blocking.length) add('warn', 'blocking-script', `${blocking.length} <script src> in <head> without async, defer, or type="module": each stops the page rendering until it downloads and runs`, null, { where: blocking[0].getAttribute('src').slice(0, 80) });
  const positive = all.filter((el) => el.hasAttribute('tabindex') && parseInt(el.getAttribute('tabindex'), 10) > 0);
  if (positive.length) add('warn', 'positive-tabindex', `${positive.length} element(s) with tabindex above 0: they jump the keyboard order ahead of the rest of the page; use 0 (or -1) and order the markup instead`, positive[0]);

  // Stylesheet rules (same-origin sheets only).
  // grid-template-rows (0fr → 1fr) is the recommended way to open a height, so it isn't flagged here.
  const LAYOUT = /(^|,\s*)(all|width|height|min-|max-|top|left|right|bottom|inset|margin|padding|flex-basis)/;
  let hasMotion = false, hasReduced = false, unreadable = 0;
  const ms = (t) => t.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000)).reduce((a, b) => Math.max(a, b), 0);
  const walk = (rules, inReduced) => {
    for (const r of rules) {
      if (r.media && /prefers-reduced-motion/.test(r.media.mediaText)) { hasReduced = true; walk(r.cssRules, true); continue; }
      if (r.cssRules && !r.style) { walk(r.cssRules, inReduced); continue; }
      if (r.type === CSSRule.KEYFRAMES_RULE) {
        for (const k of r.cssRules) if (/\b(width|height|top|left|right|bottom|margin|padding)\s*:/.test(k.style.cssText)) { add('warn', 'layout-animation', `@keyframes ${r.name} animates layout properties; animate transform and opacity instead`); break; }
        continue;
      }
      const st = r.style;
      if (!st || inReduced) continue;
      if (/\b100vh\b/.test(st.height + st.minHeight)) add('warn', 'viewport-height', `${r.selectorText} uses 100vh, which jumps under mobile browser bars; use 100dvh (or min-height: 100svh)`);
      const tp = st.transitionProperty || (st.transition && st.transition.split(/\s+/)[0]) || '';
      const td = st.transitionDuration || '';
      if (st.transition || st.transitionProperty) {
        hasMotion = true;
        if (LAYOUT.test(tp)) add('warn', 'layout-transition', `${r.selectorText} transitions "${tp}": ${tp === 'all' ? '"all" includes' : 'it animates'} layout properties; list transform, opacity, and colours explicitly`);
      }
      if (st.animationName && st.animationName !== 'none') hasMotion = true;
      const dur = Math.max(td ? ms(td) : 0, st.animationDuration ? ms(st.animationDuration) : 0, st.transition ? ms((st.transition.match(/[\d.]+m?s/g) || ['0s'])[0]) : 0);
      const infinite = /infinite/.test(st.animationIterationCount + st.animation);
      if (dur > 800 && !infinite) add('warn', 'duration', `${r.selectorText} runs ${dur}ms; interface motion is 150–300ms, entrances up to about 500ms`);
    }
  };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, false); } catch { unreadable++; } }
  const running = document.getAnimations ? document.getAnimations().length : 0;
  if ((hasMotion || running) && !hasReduced) add(running ? 'error' : 'warn', 'reduced-motion', `${running ? `${running} running animation(s)` : 'transitions'} and no @media (prefers-reduced-motion) rule`);
  if (unreadable) add('warn', 'unreadable-css', `${unreadable} cross-origin stylesheet(s) couldn't be read; their rules weren't checked`);

  // Drift from the design system's tokens.
  if (opts.tokens && opts.tokens.colors.length) {
    const tok = opts.tokens.colors.map(rgba);
    const near = (c) => tok.some((t) => Math.abs(t.r - c.r) + Math.abs(t.g - c.g) + Math.abs(t.b - c.b) <= 6);
    const off = new Map();
    for (const el of all.filter(visible)) {
      const s = cs(el);
      for (const [prop, val] of [['color', ownText(el) ? s.color : null], ['background', s.backgroundColor], ['border', parseFloat(s.borderTopWidth) > 0 ? s.borderTopColor : null]]) {
        if (!val) continue;
        const c = rgba(val);
        if (c.a === 0 || near(c) || (c.r === c.g && c.g === c.b && (c.r === 0 || c.r === 255))) continue;
        const k = `${prop} ${val}`;
        if (!off.has(k)) off.set(k, el);
      }
    }
    for (const [k, el] of [...off].slice(0, 12)) add('warn', 'off-token', `${k} is not in the design tokens`, el);
    if (off.size > 12) add('warn', 'off-token', `${off.size - 12} more off-token colour uses`);
  }
  if (opts.tokens && opts.tokens.fonts.length) {
    const allowed = opts.tokens.fonts.map((f) => f.toLowerCase());
    const used = new Set(textEls.map((el) => cs(el).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase()));
    for (const f of used) if (!allowed.some((a) => a === f)) add('warn', 'off-token', `font "${f}" is not in the design tokens`);
  }

  // ---------- tells ----------
  const COLOR_FN = /(#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\))/gi;
  const stops = (bgImage) => (bgImage.match(COLOR_FN) || []).map(rgba).filter((c) => c.a > 0.3).map(hsl).filter((h) => h.s > 0.3 && h.l > 0.15 && h.l < 0.85);
  let gradientTold = false;
  for (const el of all.filter(visible)) {
    const s = cs(el);
    if (!gradientTold && /gradient/.test(s.backgroundImage)) {
      const hs = stops(s.backgroundImage).map((h) => h.h);
      const coolPurple = hs.filter((h) => h >= 185 && h <= 300);
      if (coolPurple.length >= 2 && Math.max(...coolPurple) - Math.min(...coolPurple) >= 25) { add('tell', 'blue-purple-gradient', 'a two-tone blue→purple gradient is the most common AI default; if it isn\'t the brand, pick colours from the design system', el); gradientTold = true; }
    }
    if (/gradient/.test(s.backgroundImage) && /text/.test(s.webkitBackgroundClip || s.backgroundClip) && ownText(el) !== undefined) add('tell', 'gradient-text', 'gradient-filled text: decorative, lowers legibility, and a common AI flourish', el);
    const blw = parseFloat(s.borderLeftWidth), brw = parseFloat(s.borderRightWidth);
    if (blw >= 2 && brw === 0 && parseFloat(s.borderTopLeftRadius) + parseFloat(s.borderTopRightRadius) > 0) {
      const c = hsl(rgba(s.borderLeftColor));
      if (c.s > 0.3 && el.getBoundingClientRect().height > 40) add('tell', 'accent-border-card', 'a rounded card with a coloured left border: a stock AI pattern; use the system\'s card or no border', el);
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 16 && r.height <= 16 && parseFloat(s.borderTopLeftRadius) >= r.width / 2 && el.getAnimations && el.getAnimations().some((a) => a.effect?.getTiming?.().iterations === Infinity)) add('tell', 'pulsing-dot', 'a pulsing status dot with no live status behind it reads as decoration', el);
  }
  const DEFAULT_INDIGO = ['#6366f1', '#4f46e5', '#818cf8', '#4338ca', '#8b5cf6', '#7c3aed', '#a855f7', '#9333ea'].map(rgba);
  const indigo = all.filter(visible).find((el) => { const s = cs(el); return [s.backgroundColor, s.color].some((v) => { const c = rgba(v); return DEFAULT_INDIGO.some((d) => d.r === c.r && d.g === c.g && d.b === c.b); }); });
  if (indigo) add('tell', 'default-indigo', 'Tailwind\'s default indigo/violet as the accent: the look of an unstyled template; take the accent from the design system', indigo);
  const emojiIcons = all.filter((el) => visible(el) && isEmoji(el));
  if (emojiIcons.length >= 2) add('tell', 'emoji-icons', `${emojiIcons.length} emoji used as icons; they render differently per platform and read as placeholder`, emojiIcons[0]);
  for (const parent of all.filter((el) => el.children.length >= 3 && visible(el))) {
    const kids = [...parent.children].filter(visible);
    if (kids.length < 3 || kids.length > 6) continue;
    const sig = (k) => `${k.tagName}.${k.className}|${hasIcon(k)}|${!!k.querySelector('h2,h3,h4')}`;
    const w = kids.map((k) => k.getBoundingClientRect().width);
    if (new Set(kids.map(sig)).size === 1 && hasIcon(kids[0]) && kids[0].querySelector('h2,h3,h4') && Math.max(...w) - Math.min(...w) < 4) {
      add('tell', 'identical-cards', `${kids.length} identical icon + heading + text cards in a row: the stock AI feature grid; vary the layout or let content set the shape`, parent);
      break;
    }
  }
  const eyebrows = heads.filter((h) => {
    const prev = h.previousElementSibling;
    if (!prev || !visible(prev)) return false;
    const s = cs(prev), t = (prev.innerText || '').trim();
    return t.length > 0 && t.length < 40 && parseFloat(s.fontSize) <= 14 && (s.textTransform === 'uppercase' || (t === t.toUpperCase() && /[A-Z]{3}/.test(t)));
  }).length;
  const sections = Math.max(1, heads.filter((h) => h.tagName === 'H2').length);
  if (eyebrows >= 3 && eyebrows > Math.ceil(sections / 3)) add('tell', 'eyebrows', `${eyebrows} small uppercase labels above ${sections} section headings; one per three sections at most, or the label stops meaning anything`);
  // Template chrome (Anthropic's frontend-design names these as current AI defaults): meta strings joined by middle
  // dots, and calls to action that end in an arrow.
  const dotted = all.filter((el) => visible(el) && ownText(el) && (ownText(el).match(/ · /g) || []).length >= 1 && parseFloat(cs(el).fontSize) <= 15);
  if (dotted.length >= 3) add('tell', 'middle-dot-meta', `${dotted.length} small "a · b · c" meta strings: a stock template look; a line of plain words or a table says it more clearly`, dotted[0]);
  const arrows = all.filter((el) => el.matches('a,button') && visible(el) && /[→↗➜➔⟶]\s*$/.test((el.innerText || '').trim()));
  if (arrows.length >= 2) add('tell', 'arrow-cta', `${arrows.length} calls to action ending in an arrow: a template habit; let the words carry the action`, arrows[0]);
  const body = document.body.innerText;
  const dashes = (body.match(/—/g) || []).length;
  if (dashes >= 8) add('tell', 'em-dashes', `${dashes} em dashes in the page copy: a strong marker of AI-written text`);
  const BUZZ = /\b(elevate[sd]?|seamless(ly)?|unleash(es|ed)?|empower(s|ed|ing)?|revolutioni[sz]e[sd]?|supercharge[sd]?|next-level|cutting-edge|game-?changer|effortless(ly)?|unlock(s|ed)?|harness(es|ed)?|world-class|best-in-class|delightful(ly)?)\b/gi;
  const buzz = [...new Set((body.match(BUZZ) || []).map((w) => w.toLowerCase()))];
  if ((body.match(BUZZ) || []).length >= 3) add('tell', 'buzzwords', `stock marketing words: ${buzz.join(', ')}; say what the product does instead`);
  const ph = body.match(/\b(Acme( Corp)?|John Doe|Jane Doe|Lorem ipsum)\b/g);
  if (ph) add('tell', 'placeholder-copy', `placeholder names or text: ${[...new Set(ph)].join(', ')}`);

  // What the page actually uses, for writing a DESIGN.md from an existing interface (detect.mjs --inventory).
  let inventory = null;
  if (opts.inventory) {
    const tally = () => new Map();
    const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    const inv = { text: tally(), background: tally(), border: tally(), family: tally(), size: tally(), radius: tally() };
    const hex = (v) => { const c = rgba(v); return c.a === 0 ? null : '#' + [c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, '0')).join('') + (c.a < 1 ? ` @${c.a.toFixed(2)}` : ''); };
    for (const el of all.filter(visible)) {
      const s = cs(el);
      if (ownText(el)) { inc(inv.text, hex(s.color)); inc(inv.family, s.fontFamily.split(',')[0].replace(/["']/g, '').trim()); inc(inv.size, `${parseFloat(s.fontSize)}px`); }
      const b = hex(s.backgroundColor); if (b) inc(inv.background, b);
      if (parseFloat(s.borderTopWidth) > 0) { const c = hex(s.borderTopColor); if (c) inc(inv.border, c); }
      if (parseFloat(s.borderTopLeftRadius) > 0) inc(inv.radius, s.borderTopLeftRadius);
    }
    inventory = Object.fromEntries(Object.entries(inv).map(([k, m]) => [k, [...m].filter(([v]) => v).sort((a, b) => b[1] - a[1])]));
  }
  return { findings, sizes: [...sizes].sort((a, b) => a - b), viewport: innerWidth, inventory };
}
