// Reads a text file out of a small zip (a GitHub Actions artifact) with the browser's own
// DecompressionStream, so no third-party unzip library runs on the page.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZipReader = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_ZIP_BYTES = 10 * 1024 * 1024;
  const MAX_ENTRY_BYTES = 10 * 1024 * 1024;

  async function inflate(bytes, size) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const out = new Uint8Array(await new Response(stream).arrayBuffer());
    if (out.length !== size) throw new Error('zip entry size mismatch');
    return out;
  }

  /** Text of the first entry whose name ends with `suffix`, or null when there is none */
  async function readZipText(buffer, suffix) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 22 || buffer.byteLength > MAX_ZIP_BYTES) {
      throw new Error('not a usable zip');
    }
    const view = new DataView(buffer);
    // End of central directory: last 22 bytes plus up to 64 KB of comment
    let eocd = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 65535); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not a usable zip');
    const entries = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    for (let n = 0; n < entries; n++) {
      if (p + 46 > buffer.byteLength || view.getUint32(p, true) !== 0x02014b50) throw new Error('not a usable zip');
      const flags = view.getUint16(p + 8, true);
      const method = view.getUint16(p + 10, true);
      const compressed = view.getUint32(p + 20, true);
      const size = view.getUint32(p + 24, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const local = view.getUint32(p + 42, true);
      const name = utf8.decode(new Uint8Array(buffer, p + 46, nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (!name.endsWith(suffix)) continue;
      if (flags & 0x1) throw new Error('encrypted zip entry');
      if (size > MAX_ENTRY_BYTES) throw new Error('zip entry too large');
      if (local + 30 > buffer.byteLength || view.getUint32(local, true) !== 0x04034b50) throw new Error('not a usable zip');
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      if (start + compressed > buffer.byteLength) throw new Error('not a usable zip');
      const bytes = new Uint8Array(buffer, start, compressed);
      if (method === 0) return utf8.decode(bytes);
      if (method === 8) return utf8.decode(await inflate(bytes, size));
      throw new Error('unsupported zip compression');
    }
    return null;
  }

  return { readZipText };
});
