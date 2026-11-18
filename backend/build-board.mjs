import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const folder = dirname(fileURLToPath(import.meta.url));
const outdir = join(folder, ".dist");
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: [join(folder, "board", "index.jsx")],
  outdir,
  bundle: true,
  jsx: "automatic",
  minify: true,
  loader: { ".woff2": "file", ".woff": "file" },
});
await copyFile(join(folder, "board", "index.html"), join(outdir, "index.html"));
