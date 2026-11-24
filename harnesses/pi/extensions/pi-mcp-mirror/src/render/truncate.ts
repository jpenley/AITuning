/**
 * Native-derived from Pi 1.3.0 (upstream 71023aec1546d6d677a65669c5665c0927ce0dd0).
 * Source: packages/coding-agent/src/core/tools/truncate.ts
 * Patched-source SHA-256: 8e4507c3ed7ca7548cf7c2d7f77d07f2ae63a38b756789cbb44e9062db6c8762
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

function splitLinesForCounting(content: string): string[] {
	if (content.length === 0) {
		return [];
	}
	const lines = content.split("\n");
	if (content.endsWith("\n")) {
		lines.pop();
	}
	return lines;
}

export interface MiddleTruncationResult {
	/** The start and end of the content with a `…N chars truncated…` marker between them. */
	content: string;
	truncated: boolean;
	/** Characters left out. */
	removedChars: number;
	totalBytes: number;
	totalLines: number;
}

/**
 * Keep the start and the end of `content`, half of `maxBytes` each, and replace the middle with a
 * `…N chars truncated…` marker, like Codex does for tool output. Cuts only at character boundaries.
 */
export function truncateMiddle(content: string, maxBytes: number): MiddleTruncationResult {
	const buf = Buffer.from(content, "utf-8");
	const totalLines = splitLinesForCounting(content).length;
	if (buf.length <= maxBytes) {
		return { content, truncated: false, removedChars: 0, totalBytes: buf.length, totalLines };
	}
	// Continuation bytes (10xxxxxx) are not character starts.
	const isBoundary = (index: number) => index >= buf.length || (buf[index] & 0xc0) !== 0x80;
	let headEnd = Math.floor(maxBytes / 2);
	while (headEnd > 0 && !isBoundary(headEnd)) headEnd--;
	let tailStart = buf.length - (maxBytes - Math.floor(maxBytes / 2));
	while (tailStart < buf.length && !isBoundary(tailStart)) tailStart++;
	const head = buf.subarray(0, headEnd).toString("utf-8");
	const tail = buf.subarray(tailStart).toString("utf-8");
	const removedChars = Array.from(buf.subarray(headEnd, tailStart).toString("utf-8")).length;
	return {
		content: `${head}…${removedChars} chars truncated…${tail}`,
		truncated: true,
		removedChars,
		totalBytes: buf.length,
		totalLines,
	};
}
