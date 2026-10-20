/**
 * Native-derived from Pi 1.3.0 (upstream 71023aec1546d6d677a65669c5665c0927ce0dd0).
 * Source: packages/coding-agent/src/utils/shell.ts
 * Patched-source SHA-256: c93b05fef8d75072adeff45cdec2abfa2e03eb2910d9755c1edb45ce237e614a
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

/**
 * Sanitize binary output for display/storage.
 * Removes characters that crash string-width or cause display issues:
 * - Control characters (except tab, newline, carriage return)
 * - Unicode interlinear annotation characters U+FFF9..U+FFFB (crash string-width due to a bug)
 */
export function sanitizeBinaryOutput(str: string): string {
	// All removed characters are single UTF-16 code units, so surrogate pairs are never split.
	return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFF9-\uFFFB]/g, "");
}
