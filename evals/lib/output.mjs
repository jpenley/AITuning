// A child's output, held to a byte cap: the first and last halves are kept whole-line, the middle is dropped
// and a marker says how much. Buffers are decoded once at the end, so a character split across two chunks
// isn't corrupted.

export const cutMarker = (bytes) => `\n[behave.mjs: ${bytes} bytes of output cut here]\n`;

export function capture(maxBytes) {
  const headMax = Math.floor(maxBytes / 2);
  const tailMax = maxBytes - headMax;
  const head = [];
  const tail = [];
  let headLen = 0;
  let tailLen = 0;
  let total = 0;
  return {
    push(chunk) {
      let buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      total += buf.length;
      if (headLen < headMax) {
        const take = buf.subarray(0, headMax - headLen);
        head.push(take);
        headLen += take.length;
        buf = buf.subarray(take.length);
      }
      if (!buf.length) return;
      tail.push(buf);
      tailLen += buf.length;
      while (tail.length > 1 && tailLen - tail[0].length >= tailMax) tailLen -= tail.shift().length;
    },
    // { text, parts: [head, tail] or null, cutBytes }. text joins the parts with a marker; parts keep them
    // apart so a pattern can't match across the gap.
    result() {
      if (total <= maxBytes) return { text: Buffer.concat([...head, ...tail]).toString('utf8'), parts: null, cutBytes: 0 };
      let h = Buffer.concat(head);
      let t = Buffer.concat(tail);
      t = t.subarray(t.length - tailMax);
      // Whole lines only: a line cut in two could otherwise parse as a different, shorter event.
      const lastNl = h.lastIndexOf(10);
      if (lastNl >= 0) h = h.subarray(0, lastNl + 1);
      const firstNl = t.indexOf(10);
      if (firstNl >= 0) t = t.subarray(firstNl + 1);
      const cutBytes = total - h.length - t.length;
      const parts = [h.toString('utf8'), t.toString('utf8')];
      return { text: parts[0] + cutMarker(cutBytes) + parts[1], parts, cutBytes };
    },
  };
}
