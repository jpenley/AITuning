import { setKeybindings, Text, type TUI } from "@earendil-works/pi-tui";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { McpManagerView, type McpMenu, showMcpManager } from "__MIRROR_UI__";
import { initTheme, theme } from "__NATIVE_THEME__";
import { KeybindingsManager } from "__NATIVE_KEYBINDINGS__";

// Materialized by the isolated native Vitest wrapper. Do not import the encoder:
// the test-only patch must fail against the old real UI for unsafe output.
const attack = "\x1b]52;c;YQ==\x07\x1b[2J\x9b2J\u202e";
const escaped = "\\u001b]52;c;YQ==\\u0007\\u001b[2J\\u009b2J\\u202e";

function createView() {
	const requestRender = vi.fn();
	const tui = { requestRender } as unknown as TUI;
	return { view: new McpManagerView(tui, theme, new KeybindingsManager()), requestRender };
}

function expectSafe(output: string) {
	// Trusted native SGR remains allowed; remote OSC, CSI erasure, C1 and bidi do not.
	for (const raw of ["\x1b]52;", "\x07", "\x1b[2J", "\x9b", "\u202e"]) {
		expect(output, "UNSAFE TEXT in real manager rendering").not.toContain(raw);
	}
}

describe("MCP manager terminal display boundary", () => {
	beforeAll(() => initTheme("dark"));
	beforeEach(() => setKeybindings(new KeybindingsManager()));

	// Break caught: forwarding remote menu strings to native Text/SelectList,
	// or encoding item.value and thereby changing the selected wire identity.
	test("encodes menu display fields while returning the raw selected identity", async () => {
		const { view, requestRender } = createView();
		const opaque = `opaque:${attack}`;
		const menu: McpMenu = {
			title: `title:${attack}`,
			details: `details:${attack}\nsecond detail`,
			error: `error:${attack}\nsecond error`,
			items: [
				{ value: "other", label: "Other" },
				{ value: opaque, label: "label:\x1b[2J", description: `description:${attack}` },
			],
			selected: opaque,
			confirmLabel: `confirm:${attack}`,
			cancelLabel: `cancel:${attack}`,
		};
		const result = view.menu(() => menu);
		const output = view.render(600).join("\n");
		expectSafe(output);
		for (const field of ["title", "details", "error", "description", "confirm", "cancel"]) {
			expect(output).toContain(`${field}:${escaped}`);
		}
		expect(output).toContain("label:\\u001b[2J");
		expect(output).toContain("second detail");
		expect(output).toContain("second error");
		expect(requestRender).toHaveBeenCalled();
		view.handleInput("\r");
		expect(await result).toBe(opaque);
		expect(menu.items[1].label).toBe("label:\x1b[2J");
		expect(menu.items[1].description).toBe(`description:${attack}`);
	});

	// Break caught: securing only populated menus, but leaving empty/footer or
	// operation status strings (including the less common controls) unencoded.
	test("encodes empty menus and status before applying trusted native styling", async () => {
		const { view } = createView();
		const result = view.menu(() => ({
			title: "Empty", items: [], empty: `empty:${attack}`,
			confirmLabel: "choose", cancelLabel: `cancel:${attack}`,
		}));
		const empty = view.render(600).join("\n");
		expectSafe(empty);
		expect(empty).toContain(`empty:${escaped}`);
		expect(empty).toContain(`cancel:${escaped}`);
		view.handleInput("\x1b");
		expect(await result).toBeUndefined();

		const controls = "\x00\x09\x0b\x0d\x1f\x7f\x80\x9f\u061c\u200e\u200f\u202a\u202b\u202c\u202d\u2066\u2067\u2068\u2069";
		const visible = "\\u0000\\u0009\\u000b\\u000d\\u001f\\u007f\\u0080\\u009f\\u061c\\u200e\\u200f\\u202a\\u202b\\u202c\\u202d\\u2066\\u2067\\u2068\\u2069";
		const onCancel = vi.fn();
		view.status(`status:${attack}`, `message:${attack}${controls}\nnext line`, onCancel);
		const status = view.render(600).join("\n");
		expectSafe(status);
		for (const control of controls) expect(status, "UNSAFE TEXT in status").not.toContain(control);
		expect(status).toContain(`status:${escaped}`);
		expect(status).toContain(`message:${escaped}${visible}`);
		expect(status).toContain("next line");
		view.handleInput("\x1b");
		expect(onCancel).toHaveBeenCalledOnce();
	});

	// Break caught: encoding trusted theme ANSI, escaping LF, or changing plain
	// native formatting. Text's padding/style is compared through real rendering.
	test("preserves plain multiline text and native theme styling", async () => {
		const { view } = createView();
		const result = view.menu(() => ({
			title: "Plain title", details: "detail one\ndetail two", error: "error one\nerror two",
			items: [{ value: "plain-id", label: "Plain tool", description: "Plain description" }],
			confirmLabel: "choose", cancelLabel: "back",
		}));
		const output = view.render(100).join("\n");
		expect(output).toContain(theme.fg("accent", theme.bold("Plain title")));
		for (const text of ["detail one", "detail two", "error one", "error two", "Plain tool", "Plain description"]) {
			expect(output).toContain(text);
		}
		expect(output).not.toContain("\\u000a");
		expect(output.split("\n").findIndex((line) => line.includes("detail two"))).toBe(
			output.split("\n").findIndex((line) => line.includes("detail one")) + 1,
		);
		view.handleInput("\r");
		expect(await result).toBe("plain-id");
		view.status("Plain title", "line one\nline two");
		const lines = view.render(100);
		const start = lines.findIndex((line) => line.includes("line one"));
		const nativeLines = new Text(theme.fg("muted", "line one\nline two"), 1, 0).render(100);
		expect(start).toBeGreaterThanOrEqual(0);
		expect(lines.slice(start, start + nativeLines.length)).toEqual(nativeLines);
	});

	// Break caught: native SelectList displays value when label is empty.
	// Encode that display fallback without changing the opaque result value.
	test("encodes the empty-label value fallback but preserves selection identity", async () => {
		const { view } = createView();
		const result = view.menu(() => ({
			title: "Fallback", items: [{ value: attack, label: "" }],
			confirmLabel: "choose", cancelLabel: "back",
		}));
		const output = view.render(600).join("\n");
		expect(output.includes("\x1b]52;"), "empty label cannot expose raw OSC").toBe(false);
		expect(output.includes(escaped)).toBe(true);
		view.handleInput("\r");
		expect(await result).toBe(attack);
	});

	// The producer-to-sink remote exploit was unverified in review. The public
	// manager callback still must treat any thrown message as plain display text.
	test("encodes manager callback exceptions before native notifications", async () => {
		const notify = vi.fn<ExtensionCommandContext["ui"]["notify"]>();
		const tui = { requestRender: vi.fn() } as unknown as TUI;
		const ctx = { ui: { notify,
			custom: (factory: Parameters<ExtensionCommandContext["ui"]["custom"]>[0]) =>
				new Promise(resolve => { factory(tui, theme, new KeybindingsManager(), resolve); }),
		} } as unknown as ExtensionCommandContext;
		await showMcpManager(ctx, async () => { throw new Error(attack); });
		expect(notify).toHaveBeenCalledOnce();
		const [message, type] = notify.mock.calls[0];
		expect(message.includes("\x1b]52;"), "exception notification cannot execute OSC").toBe(false);
		expect(message).toBe(escaped);
		expect(type).toBe("error");
	});
});
