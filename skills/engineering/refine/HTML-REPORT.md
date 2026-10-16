# HTML report format

One self-contained HTML file in the OS temp directory. Tailwind and Mermaid come from CDNs. Mermaid handles graph-shaped diagrams; hand-built divs and inline SVG handle the editorial visuals (mass diagrams, cross-sections). Mix them, so the diagrams don't all look alike.

## Scaffold

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Architecture review for {{repo name}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## Header

Repo name, date, and a compact legend: solid box = module, dashed line = seam, red arrow = leakage, thick dark box = deep module. Straight into the candidates after that.

## Candidate card

The diagrams carry the weight; prose is sparse and uses the `modules` vocabulary. Each candidate is one `<article>`:

- **Title**: names the deepening ("Collapse the Order intake pipeline").
- **Badges**: strength (`Strong` emerald, `Worth exploring` amber, `Speculative` slate) and the dependency category (`in-process`, `local-substitutable`, `remote-owned`, `true-external`).
- **Edge evidence**: the measured signals that flagged it (hot spot, in a cycle, N deep imports, fan-in / fan-out).
- **Files**: monospaced list.
- **Before / after diagram**: the centrepiece, two columns side by side.
- **Problem**: one sentence.
- **Solution**: one sentence.
- **Wins**: bullets of six words or fewer, in glossary terms ("locality: bugs concentrate in one module", "interface shrinks; implementation absorbs the wrappers").
- **ADR callout**, when relevant: one line in an amber box.

If a diagram needs a paragraph to be understood, redraw the diagram.

## Diagram patterns

- **Mermaid flowchart**: the workhorse for dependencies and call flow ("X calls Y calls Z, and look at the mess"). Colour leakage edges red and the deep module dark with `classDef`. Sequence diagrams suit "before: 6 round trips; after: 1".
  ```html
  <div class="rounded-lg border border-slate-200 bg-white p-4">
    <pre class="mermaid">
      flowchart LR
        A[OrderHandler] --> B[OrderValidator]
        B --> C[OrderRepo]
        C -.leak.-> D[PricingClient]
        classDef leak stroke:#dc2626,stroke-width:2px;
        class C,D leak
    </pre>
  </div>
  ```
- **Hand-built boxes and arrows**: divs for modules, inline SVG for arrows, when the "after" should read as one thick-bordered deep module with greyed-out internals.
- **Cross-section**: stacked horizontal bands for the layers a call passes through; before, six thin bands doing nothing; after, one thick band named for its responsibility.
- **Mass diagram**: two rectangles per module, interface and implementation. Shallow: the interface rectangle is nearly as tall as the implementation. Deep: short interface, tall implementation.
- **Call-graph collapse**: before, a tree of calls as nested boxes; after, one box with the now-internal calls faded inside.

## Style

- Editorial, not dashboard: generous whitespace; a serif for headings works well with stone and slate.
- One accent colour (emerald or indigo), red for leakage, amber for warnings.
- Diagrams about 320px tall, so before and after sit side by side without scrolling.
- Module labels inside diagrams in `text-xs uppercase tracking-wider`, so they read as a schematic.
- The only scripts are the Tailwind CDN and the Mermaid import; everything else is static.

## Top recommendation

One larger card: the candidate's name, one sentence on why, and a link to its card.

## Tone

Plain and concise, with the architectural nouns and verbs taken straight from the `modules` vocabulary: module, interface, implementation, depth, deep, shallow, seam, adapter, leverage, locality. Name gains in those terms ("locality", "leverage") rather than general ones ("easier to maintain", "cleaner code"). State findings directly: "Order intake module is shallow: its interface nearly matches its implementation." "Pricing leaks across the seam." If a sentence could be a bullet, make it a bullet; if a bullet could be cut, cut it.
