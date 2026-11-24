# Voice

For text that carries a person's voice (a post, newsletter, essay, letter, announcement, long email, or report) and for any draft someone else wrote that you are asked to edit. The writer's point and voice survive the edit; the patterns that make text read as machine-written go. Adapted from Peter Yang's no-ai-slop (MIT), with six judgement rules and the "nothing fell out" check from blader/humanizer (MIT).

## Edit

The default job. Writing a new piece is the same job: these rules apply to your own draft, and its facts come from the user.

1. **Read the whole draft** before changing a word.
2. **Name the core point and the voice traits to keep**: the writer's vocabulary, cadence, bluntness, humour, profanity, real uncertainty ("I think" or "maybe" when the writer means it), digressions that carry character, and fragments that land. If you can't name the core point, ask.
3. **Make the minimum effective edit.** Cut in proportion to the actual slop: a draft with three slop lines gets three fixes, not a rewrite. A strong human sentence stays exactly as written, rough edges included. Reorder only when the order hurts the piece, and say why.
4. **Take every fact from the draft or the user.** Claims, numbers, examples, names, quotes, sources, and advice come from the draft, the user, or files they point you to. When a sentence needs a fact the draft doesn't have (how much faster, which customers, whose study), cut the vague claim or put a bracketed question in its place ("[how many hours a week did early users save?]"), and list each question under "What changed".
5. **Check nothing fell out.** Compare your edit with the draft: every number, name, date, ranking, and "at the same time" claim still stands, unless you cut it on purpose and say so under "What changed".
6. **Lint** the edited draft (step 5 in [SKILL.md](SKILL.md)).
7. **Reply with** the full edited draft, then a short "What changed" section: the kinds of change you made, and each fact you need from the writer.

## Detect

For "is this AI slop?", "does this read as AI-written?", or a request to flag or audit a draft without rewriting it. A detector's guess about who wrote a text proves nothing; a quoted pattern is evidence the user can check.

The reply is, in order:

1. One entry per pattern found: its name, the line quoted, and the fix in a few words.
2. One sentence offering to edit the draft.

The draft stays as it is: the reply carries no rewritten version, no score, and no call on whether AI wrote it.

## Judgement the linter can't make

The linter flags the mechanical patterns. These need a reader:

- **The portability test.** A sentence that could move unchanged to another person, company, or product is filler: cut it, or replace it with a fact, mechanism, or example specific to this subject, taken from the draft.
- **State the point plainly.** A claim set up against a straw alternative ("It's not X. It's Y."), a question the writer answers themselves ("The result?"), or a lead-in that flatters the writer as the lone expert ("Here's what nobody tells you") becomes the claim on its own: "Y."
- **Show, and let the reader judge.** Facts, examples, and consequences carry the emphasis. A line that tells the reader what to notice or how much it matters ("This distinction matters") goes, and the point stands on its support.
- **End on the last concrete point.** The piece ends on its last fact, takeaway, or next action, or the writer's sign-off. A closing aphorism or metaphor (a kicker) and a recap of what the reader just read are deleted, not rewritten into better ones.
- **One word per thing.** Once a thing has a name, repeat it. Rotating synonyms for style ("the agent", "the assistant", "the tool") makes the reader wonder whether they are three things.
- **Lead with what the reader needs.** In a reply or email to someone who already has the background, the decision or the ask comes first, and only the facts they lack stay.
- **Answer only objections someone raised.** A defence against a view nobody holds ("I'm not saying X is bad", "a tempting approach would be") goes; an option the reader will really weigh stays, stated as that option.
- **Count what's there.** A list of three only when there are three things; adjectives the draft doesn't support ("faster, cheaper, and simpler") keep only what it supports, or get a bracketed question.
- **Vary a repeated opening.** Three sentences of running prose in a row that start with the same word or name read as a pattern: merge them. Parallel list items and steps stay parallel.
- **Ask instead of guessing.** A sentence that notes missing information and then guesses anyway ("details are not documented, but it appears to") becomes a bracketed question.
- **Point at what exists.** A sentence about the document itself ("the table below compares") stays only when the thing is there; otherwise ask for it.
