---
name: animate
description: Use when adding or changing animation, transitions, hover or press effects, things that open and close smoothly, scroll-triggered reveals, loading states, or page and component motion, or when motion feels janky or distracting.
---

# Animate

For new motion, choose feedback, orientation, or attention. For maintenance of an existing design, preserve its motion and visual identity within the requested scope; fix the implementation cost and accessibility paths. Load the `craft` skill with your skill tool first: its motion floor applies here.

## 1. Give each animation a job

List what moves and why before writing any. Then size it by job:

| Job | Examples | Duration |
|---|---|---|
| Feedback | hover, press, toggle | 100–200ms |
| State change | open and close, expand, tab switch | 200–300ms |
| Orientation | an entrance, a page or panel arriving | up to about 500ms; a stagger's whole run within 500ms |
| Attention | a new notification, an error | once, then still |

Exits run faster than entrances (about three quarters). Things of the same kind share one duration and one curve. On Operate surfaces (tools, dashboards), keep feedback and state changes and drop entrances.

## 2. Build it so it can't break the page

- To open a height, transition `grid-template-rows` from `0fr` to `1fr` or use `interpolate-size: allow-keywords`, not `height` or `max-height` guesses.
- Content that starts hidden for a reveal is hidden only behind a class the script adds (for example `.js .reveal { opacity: 0 }` with `document.documentElement.classList.add('js')`), so it's visible when the script is slow or fails.
- Reduced motion: under `prefers-reduced-motion: reduce`, remove movement and parallax, keep instant or opacity-only changes, and check the same preference in any script that animates (`matchMedia('(prefers-reduced-motion: reduce)')`).
- New continuous loops need a live purpose (a spinner while loading, a recording indicator). Existing loops being maintained keep their intended visible behavior; suspend work while offscreen or hidden.

## 3. Check

Run `craft`'s detector on the page; its motion findings (`layout-transition`, `layout-animation`, `duration`, `reduced-motion`) are this skill's. Then load the page with scripts disabled (or the reveal class never added) and confirm all content shows.

**Done when** new motion has a job from the table, maintained motion preserves the requested behavior, the detector reports no motion findings, and the page is complete without its script.
