# Third-party notices

AITuning is MIT licensed. Existing upstream copyright and license notices remain
applicable to adapted or copied material. Attribution and the affected skills are
listed in the [flowstate](skills/README.md#sources-and-licenses),
[trajectory](trajectory/README.md#sources-and-licences), and
[knowing](knowing/README.md#sources-and-licences) READMEs.

Full license texts for the principal adapted sources follow:

- [mattpocock/skills](https://github.com/mattpocock/skills): [license](LICENSES/mattpocock-skills.txt).
- [obra/superpowers](https://github.com/obra/superpowers): [license](LICENSES/superpowers.txt).
- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills): [license](LICENSES/addyosmani-agent-skills.txt).
- [jkudish/jev-mcp](https://github.com/jkudish/jev-mcp): [license](LICENSES/jev-mcp.txt).
- [cursor/plugins/tree/main/pstack](https://github.com/cursor/plugins/tree/main/pstack): [license](LICENSES/cursor-plugins/pstack.txt).
- Evaluation claims graders credited to Anthropic skill-creator: [Apache License 2.0](LICENSES/anthropic-skill-creator.txt).

The writing skill also retains [Hardik Pandya's MIT notice](packs/writing/skills/prose/STOP-SLOP-LICENSE.txt).

The Jev tool reference preserves its copied-source attribution in the file.
Sources used for ideas only are identified in the collection READMEs; their code
is not bundled. Image zoom dependencies are installed separately from the lockfile
and retain their own licenses.

The optional Claude code-mode broker bundles [QuickJS](mods/code-mode/dist/QUICKJS-LICENSE) and [quickjs-emscripten-core](mods/code-mode/dist/CORE-LICENSE) with their complete license notices. Development dependencies are pinned in its package lockfile and retain their own licenses.

The Pi MCP mirror, native elicitation patch and predictive SDK support retain the [native Pi MIT license](LICENSES/pi-native.txt). The mirror keeps embedded notices, including the Sindre Sorhus MIT notice in its ANSI helper. Owned contributions and the process-cleanup helper are distributed under the repository MIT license with owner-confirmed rights. Herdr managed integration, RPIV and installed Pi/dependency packages are not bundled and retain their own licenses.
