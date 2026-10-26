import { strToU8, zipSync } from "fflate";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFiles } from "@/components/assignment/readFiles";

const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const zipFile = (name: string, bytes: Uint8Array) => new File([bytes as BlobPart], name, { type: "application/zip" });

async function read(files: File[]) {
  const calls: [number, number][] = [];
  const out = await readFiles(files, (done, total) => calls.push([done, total]));
  return { out, last: calls.at(-1) };
}

describe("readFiles", () => {
  it("expands a .zip, skips .html files and junk, and hashes each file", async () => {
    const nb = strToU8('{"cells": []}');
    const zip = zipSync({
      "subs/alice_1_10_hw.ipynb": nb,
      "subs/alice_1_11_hw.html": strToU8("<html></html>"),
      "subs/": new Uint8Array(),
      "__MACOSX/subs/._alice_1_10_hw.ipynb": strToU8("x"),
      "subs/.DS_Store": strToU8("x"),
      "subs/empty.py": new Uint8Array(),
    });
    const { out, last } = await read([zipFile("submissions.zip", zip)]);
    expect(out.map((r) => [r.name, r.status, r.zip])).toEqual([
      ["alice_1_10_hw.ipynb", "ok", "submissions.zip"],
      ["alice_1_11_hw.html", "skip", "submissions.zip"],
    ]);
    expect(out[0].sha256).toBe(sha(nb));
    expect(out[0].file.type).toBe("application/x-ipynb+json");
    expect(await out[0].file.text()).toBe('{"cells": []}');
    expect(last).toEqual([2, 2]);
  });

  it("keeps loose .html files and reports empty ones", async () => {
    const { out } = await read([new File(["<p>hi</p>"], "page.html"), new File([], "empty.py"), new File(["x"], ".DS_Store")]);
    expect(out.map((r) => [r.name, r.status])).toEqual([
      ["page.html", "ok"],
      ["empty.py", "error"],
    ]);
  });

  it("reports a damaged .zip without failing the other files", async () => {
    const { out } = await read([zipFile("broken.zip", strToU8("not a zip at all")), new File(["print(1)"], "a.py")]);
    expect(out.map((r) => [r.name, r.status])).toEqual([
      ["broken.zip", "error"],
      ["a.py", "ok"],
    ]);
    expect(out[0].msg).toContain("couldn't be opened");
  });

  it("rejects entries over 25 MB without reading them, and reads large archives in batches", async () => {
    const big = new Uint8Array(26 * 1024 * 1024);
    const parts = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`part${i}.py`, new Uint8Array(10 * 1024 * 1024).fill(i + 1)]));
    const { out } = await read([zipFile("many.zip", zipSync({ "big.py": big, ...parts }))]);
    expect(out[0]).toMatchObject({ name: "big.py", status: "error" });
    expect(out.slice(1).map((r) => [r.name, r.status, r.file.size])).toEqual(Object.keys(parts).map((n) => [n, "ok", 10 * 1024 * 1024]));
    expect(out[3].sha256).toBe(sha(parts["part2.py"]));
  });

  it("reports entries it can't decompress and still reads the rest", async () => {
    const zip = zipSync({ "bad.py": strToU8("a".repeat(5000)), "odd.py": strToU8("b".repeat(5000)), "good.py": strToU8("c".repeat(5000)) });
    // Make bad.py's deflate data invalid (first block type 11, which doesn't exist).
    const nameLen = zip[26] | (zip[27] << 8);
    const extraLen = zip[28] | (zip[29] << 8);
    zip[30 + nameLen + extraLen] = 0x07;
    // Mark odd.py as compressed with Deflate64 (method 9) in the central directory.
    const view = new DataView(zip.buffer);
    for (let o = zip.length - 22; o > 0; o--) {
      if (view.getUint32(o, true) !== 0x02014b50) continue;
      const n = view.getUint16(o + 28, true);
      if (new TextDecoder().decode(zip.subarray(o + 46, o + 46 + n)) === "odd.py") view.setUint16(o + 10, 9, true);
    }
    const { out } = await read([zipFile("mixed.zip", zip)]);
    const byName = Object.fromEntries(out.map((r) => [r.name, r]));
    expect(byName["bad.py"]).toMatchObject({ status: "error", msg: expect.stringContaining("couldn't be read") });
    expect(byName["odd.py"]).toMatchObject({ status: "error", msg: expect.stringContaining("compression method") });
    expect(byName["good.py"]).toMatchObject({ status: "ok", sha256: sha(strToU8("c".repeat(5000))) });
  });
});
