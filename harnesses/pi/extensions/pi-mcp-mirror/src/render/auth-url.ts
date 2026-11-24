/**
 * Native-derived from Pi 1.3.0 (upstream 71023aec1546d6d677a65669c5665c0927ce0dd0).
 * Source: packages/coding-agent/src/modes/interactive/components/auth-url.ts
 * Patched-source SHA-256: a4b3531e947746ca1bc2319b717ff79b37898366d282d02f9fc0b955481fc913
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

import { copyToClipboard, keyHint, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, hyperlink, Text, type TUI } from "@earendil-works/pi-tui";

/**
 * A sign-in URL with a click hint and a copy hint. Hosts call `copy()` when `app.message.copy` is
 * pressed, since a long URL wraps and often cannot be selected or clicked as a whole (SSH, tmux).
 */
export class AuthUrlComponent extends Container {
	readonly url: string;
	private readonly tui: TUI;
	private readonly hint: Text;
	private readonly theme: Theme;

	constructor(tui: TUI, url: string, theme: Theme) {
		super();
		this.tui = tui;
		this.url = url;
		this.theme = theme;
		this.addChild(new Text(theme.fg("accent", hyperlink(url, url)), 1, 0));
		this.hint = new Text("", 1, 0);
		this.addChild(this.hint);
		this.setHint(keyHint("app.message.copy", "to copy"));
	}

	private setHint(suffix: string): void {
		const clickHint = process.platform === "darwin" ? "Cmd+click to open" : "Ctrl+click to open";
		this.hint.setText(`${this.theme.fg("dim", hyperlink(clickHint, this.url))} ${this.theme.fg("dim", "•")} ${suffix}`);
		this.tui.requestRender();
	}

	async copy(): Promise<void> {
		try {
			await copyToClipboard(this.url);
			this.setHint(this.theme.fg("success", "Copied URL to clipboard"));
		} catch (error) {
			this.setHint(this.theme.fg("error", error instanceof Error ? error.message : String(error)));
		}
	}
}
