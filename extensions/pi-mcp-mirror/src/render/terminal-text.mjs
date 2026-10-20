/**
 * Encode untrusted plain text before trusted terminal/theme styling.
 * C0 except LF (U+0000–0009, U+000B–001F), DEL/C1 (U+007F–009F),
 * and Unicode Bidi_Control (U+061C, U+200E–200F, U+202A–202E,
 * U+2066–2069) become visible lowercase \\uXXXX escapes.
 * LF is preserved for multiline details/errors. Other text is unchanged.
 * This is a display boundary, not a wire/identity or general Unicode sanitizer:
 * it does not prevent confusables, layout spoofing via LF, or oversized content.
 * Never apply it to already themed ANSI, opaque values, or URL copy targets.
 *
 * @param {string} text
 * @returns {string}
 */
export function terminalText(text) {
	return text.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e-\u200f\u202a-\u202e\u2066-\u2069]/g,
		(control) => `\\u${control.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
