// The standalone Python the Install button fetches when a machine has neither
// uv nor a Python 3.10–3.13 (server/standalonePython.ts) — the packaged
// desktop app's usual case on Windows and Linux.
//
// The Windows half cannot be RUN here, so its path logic is proved as logic:
// the lookup that replaced `where` (PATHEXT, the `Path` spelling, quoted
// entries), the venv's Scripts\python.exe, the standalone's python.exe, and
// the Windows asset in the pinned table. The unpacker is driven with archives
// the system tar writes in both of its formats, plus a hand-made hostile one.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { after, describe, it } from "node:test";
import {
  extractTarGz,
  fetchStandalonePython,
  findOnPath,
  PYTHON_BUILDS,
  pythonBuildFor,
  standalonePythonExe,
  venvPythonIn,
  type PythonBuild,
} from "../server/standalonePython.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "astrolabe-pbs-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

describe("finding a program without which or where", () => {
  it("walks a POSIX PATH in order", () => {
    const files = new Set(["/opt/uv/bin/uv", "/usr/bin/uv"]);
    assert.equal(findOnPath("uv", { PATH: "/nope:/opt/uv/bin:/usr/bin" }, "linux", (p) => files.has(p)), "/opt/uv/bin/uv");
    assert.equal(findOnPath("python3", { PATH: "/usr/bin:/bin" }, "linux", (p) => files.has(p)), null);
    assert.equal(findOnPath("uv", {}, "linux", () => true), null, "no PATH, nothing found");
  });

  it("on Windows: PATHEXT, the `Path` spelling, quoted entries, case-blind extensions", () => {
    const files = new Set(["C:\\Users\\r\\.local\\bin\\uv.exe", "C:\\Program Files\\Python312\\python.exe"]);
    const env = { Path: 'C:\\Windows\\System32;"C:\\Program Files\\Python312";C:\\Users\\r\\.local\\bin', PATHEXT: ".COM;.EXE;.BAT" };
    assert.equal(findOnPath("uv", env, "win32", (p) => files.has(p)), "C:\\Users\\r\\.local\\bin\\uv.exe");
    assert.equal(findOnPath("python", env, "win32", (p) => files.has(p)), "C:\\Program Files\\Python312\\python.exe");
    assert.equal(findOnPath("python.exe", env, "win32", (p) => files.has(p)), "C:\\Program Files\\Python312\\python.exe");
    assert.equal(findOnPath("py", env, "win32", (p) => files.has(p)), null);
  });
});

describe("where the interpreters are", () => {
  it("the venv: Scripts\\python.exe on Windows, bin/python elsewhere", () => {
    assert.equal(venvPythonIn("C:\\data\\tts\\venv", "win32"), "C:\\data\\tts\\venv\\Scripts\\python.exe");
    assert.equal(venvPythonIn("/data/tts/venv", "linux"), "/data/tts/venv/bin/python");
  });

  it("the standalone build: python.exe at its root on Windows, bin/python3 elsewhere", () => {
    assert.equal(standalonePythonExe("C:\\data\\tts\\python", "win32"), "C:\\data\\tts\\python\\python.exe");
    assert.equal(standalonePythonExe("/data/tts/python", "darwin"), "/data/tts/python/bin/python3");
  });
});

describe("the pinned builds", () => {
  it("covers the desktop app's platforms, each an install-only stripped CPython 3.12 with a size and a digest", () => {
    for (const key of ["linux-x64", "linux-arm64", "win32-x64", "win32-arm64", "darwin-x64", "darwin-arm64"]) {
      const b = PYTHON_BUILDS[key];
      assert.ok(b, key);
      assert.match(b.file, /^cpython-3\.12\.\d+\+\d{8}-.+-install_only_stripped\.tar\.gz$/, key);
      assert.match(b.sha256, /^[0-9a-f]{64}$/, key);
      assert.ok(b.bytes > 15_000_000 && b.bytes < 40_000_000, `${key}: ${b.bytes}`);
      assert.ok(b.url.startsWith("https://github.com/astral-sh/python-build-standalone/releases/download/"), key);
      assert.ok(b.url.includes("%2B"), `${key}: the + in the name is escaped`);
    }
    assert.match(pythonBuildFor("win32", "x64")!.file, /x86_64-pc-windows-msvc/);
    assert.match(pythonBuildFor("linux", "x64")!.file, /x86_64-unknown-linux-gnu/);
    assert.equal(pythonBuildFor("linux", "ia32"), null);
    assert.equal(pythonBuildFor("freebsd", "x64"), null);
  });
});

/** A python-build-standalone-shaped tree: python/bin/python3 (a script
 *  standing in), a symlink beside it, a long path, a Windows python.exe. */
function makeTree(root: string): void {
  const long = path.join(root, "python", "lib", "a".repeat(60), "b".repeat(60));
  mkdirSync(path.join(root, "python", "bin"), { recursive: true });
  mkdirSync(long, { recursive: true });
  writeFileSync(path.join(root, "python", "bin", "python3.12"), "#!/bin/sh\necho 3 12\n", { mode: 0o755 });
  spawnSync("ln", ["-s", "python3.12", path.join(root, "python", "bin", "python3")]);
  writeFileSync(path.join(long, "module.py"), "x = 1\n");
  writeFileSync(path.join(root, "python", "python.exe"), "MZ");
}

function tarOf(format: "gnu" | "pax"): string {
  const src = path.join(tmp, `src-${format}`);
  makeTree(src);
  const out = path.join(tmp, `py-${format}.tar.gz`);
  const r = spawnSync("tar", [`--format=${format}`, "-czf", out, "-C", src, "python"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return out;
}

describe("unpacking", () => {
  const hasTar = spawnSync("tar", ["--version"]).status === 0;

  for (const format of ["gnu", "pax"] as const) {
    it(`unpacks a ${format} archive: files keep their mode, symlinks stay links, long names arrive`, { skip: !hasTar }, async () => {
      const dest = path.join(tmp, `out-${format}`);
      await extractTarGz(tarOf(format), dest, "linux");
      const exe = path.join(dest, "python", "bin", "python3.12");
      assert.equal(readFileSync(exe, "utf8"), "#!/bin/sh\necho 3 12\n");
      assert.ok((statSync(exe).mode & 0o111) !== 0, "executable");
      const link = path.join(dest, "python", "bin", "python3");
      assert.ok(lstatSync(link).isSymbolicLink());
      assert.equal(readlinkSync(link), "python3.12");
      assert.ok(existsSync(path.join(dest, "python", "lib", "a".repeat(60), "b".repeat(60), "module.py")));
    });
  }

  it("on Windows a symlink is unpacked as a copy of its target", { skip: !hasTar }, async () => {
    const dest = path.join(tmp, "out-win");
    await extractTarGz(tarOf("gnu"), dest, "win32");
    const link = path.join(dest, "python", "bin", "python3");
    assert.ok(!lstatSync(link).isSymbolicLink());
    assert.equal(readFileSync(link, "utf8"), "#!/bin/sh\necho 3 12\n");
  });

  it("refuses an archive that names a path outside its folder", async () => {
    const header = Buffer.alloc(512);
    header.write("../escaped.txt", 0, "utf8");
    header.write("0000644\0", 100, "latin1");
    header.write("00000000005\0", 124, "latin1");
    header.write("0", 156, "latin1");
    header.write("ustar\0", 257, "latin1");
    header.write("00", 263, "latin1");
    header.fill(" ", 148, 156);
    let sum = 0;
    for (const b of header) sum += b;
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "latin1");
    const body = Buffer.alloc(512);
    body.write("evil\n");
    const archive = path.join(tmp, "evil.tar.gz");
    writeFileSync(archive, gzipSync(Buffer.concat([header, body, Buffer.alloc(1024)])));
    const dest = path.join(tmp, "out-evil");
    await assert.rejects(extractTarGz(archive, dest, "linux"), /outside its folder/);
    assert.ok(!existsSync(path.join(tmp, "escaped.txt")));
  });
});

describe("fetching", () => {
  const hasTar = spawnSync("tar", ["--version"]).status === 0;
  const serve = (bytes: Buffer): typeof fetch =>
    (async () => new Response(new Uint8Array(bytes), { status: 200 })) as unknown as typeof fetch;

  it("checks the size and the digest, unpacks into the root, and answers the interpreter", { skip: !hasTar }, async () => {
    const bytes = readFileSync(tarOf("gnu"));
    const spec: PythonBuild = { file: "py.tar.gz", url: "https://example.invalid/py.tar.gz", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    const root = path.join(tmp, "data", "tts", "python");
    const heard: number[] = [];
    const exe = await fetchStandalonePython(root, (p) => heard.push(p), { platform: "linux", arch: "x64", fetcher: serve(bytes), spec });
    assert.equal(exe, path.join(root, "bin", "python3"));
    assert.ok(existsSync(exe));
    assert.equal(heard[heard.length - 1], 100, "the progress reaches 100");
    assert.ok(!existsSync(`${root}.part`), "no staging left behind");
    assert.deepEqual(
      (await import("node:fs")).readdirSync(path.dirname(root)).filter((n) => n.endsWith(".part")),
      [],
      "no tarball left behind",
    );
    // A second call finds it and fetches nothing.
    const again = await fetchStandalonePython(root, () => {}, { platform: "linux", arch: "x64", fetcher: (() => { throw new Error("fetched twice"); }) as unknown as typeof fetch, spec });
    assert.equal(again, exe);
  });

  it("refuses a download of the wrong size or the wrong digest, and keeps nothing", async () => {
    const bytes = Buffer.from("not a python");
    const root = path.join(tmp, "data2", "tts", "python");
    const wrongSize: PythonBuild = { file: "py.tar.gz", url: "https://example.invalid/py", bytes: 999, sha256: "0".repeat(64) };
    await assert.rejects(fetchStandalonePython(root, () => {}, { platform: "linux", arch: "x64", fetcher: serve(bytes), spec: wrongSize }), /arrived at 12 bytes, not 999/);
    const wrongSum: PythonBuild = { ...wrongSize, bytes: bytes.length };
    await assert.rejects(fetchStandalonePython(root, () => {}, { platform: "linux", arch: "x64", fetcher: serve(bytes), spec: wrongSum }), /checksum/);
    assert.ok(!existsSync(root));
  });

  it("says so when the platform has no build", async () => {
    await assert.rejects(fetchStandalonePython(path.join(tmp, "x"), () => {}, { platform: "linux", arch: "ia32" }), /No standalone Python is offered for linux-ia32/);
  });
});
