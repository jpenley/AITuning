/**
 * Native-derived from Pi 1.3.0 (upstream 71023aec1546d6d677a65669c5665c0927ce0dd0).
 * Source: packages/coding-agent/src/utils/ansi.ts
 * Patched-source SHA-256: 47b4f605f05b42edc63fb9dcc6f2eccc810ba14306fb76bde715f027d3dae111
 *
 * MIT License
 *
 * Copyright (c) 2025 Mario Zechner
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/*
 * Portions of this file are derived from:
 * - ansi-regex (https://github.com/chalk/ansi-regex)
 * - strip-ansi (https://github.com/chalk/strip-ansi)
 *
 * MIT License
 *
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// Valid string terminator sequences are BEL, ESC\, and 0x9c
const ST = "(?:\\u0007|\\u001B\\u005C|\\u009C)";

// OSC sequences: ESC ] ... ST
const OSC_START = "\\u001B\\]";

// CSI and related: ESC/C1, optional intermediates, optional params (supports ; and :), then final byte
const CSI_START = "[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?";
const CSI_FINAL = "[\\dA-PR-TZcf-nq-uy=><~]";

// Complete sequences. OSC is non-greedy until the first ST.
const ansiRegex = new RegExp(`(?:${OSC_START}[\\s\\S]*?${ST})|${CSI_START}${CSI_FINAL}`, "g");

export function stripAnsi(value: string): string {
	if (typeof value !== "string") {
		throw new TypeError(`Expected a \`string\`, got \`${typeof value}\``);
	}

	// Fast path: ANSI codes require ESC (7-bit) or CSI (8-bit) introducer
	if (!value.includes("\u001B") && !value.includes("\u009B")) {
		return value;
	}

	// Even though the regex is global, we don't need to reset the `.lastIndex`
	// because unlike `.exec()` and `.test()`, `.replace()` does it automatically
	// and doing it manually has a performance penalty.
	return value.replace(ansiRegex, "");
}
