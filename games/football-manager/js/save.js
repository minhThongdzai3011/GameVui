// Lưu ván: tự lưu vào IndexedDB của trình duyệt (dung lượng lớn, không giới hạn 5 MB như
// localStorage). Chuyển sang trình duyệt khác bằng "mã save" giống Nông Trại Vui:
// "GVFM1:" + base64 của JSON đã nén deflate (CompressionStream); trình duyệt không có
// CompressionStream thì dùng "GVFM0:" + base64 JSON không nén.
(function () {
  "use strict";
  const FM = window.FM;
  const DB = "gamevui-football-manager";
  const STORE = "saves";
  const SLOT = "current";

  function open() {
    return new Promise((ok, fail) => {
      if (!window.indexedDB) return fail(new Error("no indexedDB"));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fail(req.error);
    });
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((ok, fail) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => ok(r && r.result);
      t.onerror = () => fail(t.error);
    });
  }

  FM.Save = {
    async store(state) {
      const data = { savedAt: new Date().toISOString(), state };
      try {
        await tx("readwrite", (os) => os.put(data, SLOT));
      } catch {
        try {
          localStorage.setItem("gvfm-save", JSON.stringify(data)); // dự phòng
        } catch {
          /* hết chỗ / bị chặn */
        }
      }
    },
    async load() {
      try {
        const d = await tx("readonly", (os) => os.get(SLOT));
        if (d && d.state) return d;
      } catch {
        /* thử dự phòng */
      }
      try {
        return JSON.parse(localStorage.getItem("gvfm-save")) || null;
      } catch {
        return null;
      }
    },
    async clear() {
      try {
        await tx("readwrite", (os) => os.delete(SLOT));
      } catch {
        /* bỏ qua */
      }
      try {
        localStorage.removeItem("gvfm-save");
      } catch {
        /* bỏ qua */
      }
    },

    async exportCode(state) {
      const bytes = new TextEncoder().encode(JSON.stringify(state));
      if (window.CompressionStream) {
        const packed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
        return "GVFM1:" + toB64(packed);
      }
      return "GVFM0:" + toB64(bytes);
    },
    async importCode(code) {
      const s = String(code || "").replace(/\s+/g, "");
      const m = s.match(/^GVFM([01]):(.+)$/);
      if (!m) throw new Error("Mã không đúng định dạng (phải bắt đầu bằng GVFM1: hoặc GVFM0:).");
      let bytes = fromB64(m[2]);
      if (m[1] === "1") {
        if (!window.DecompressionStream) throw new Error("Trình duyệt này không giải nén được mã, hãy dùng Chrome / Edge / Firefox bản mới.");
        bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
      }
      const state = JSON.parse(new TextDecoder().decode(bytes));
      if (!state || state.v !== 1 || !state.clubs || !state.p || !state.user) throw new Error("Mã không chứa dữ liệu ván chơi hợp lệ.");
      return state;
    },
  };
  function toB64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
})();
