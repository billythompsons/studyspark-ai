#!/usr/bin/env node
// Embeds public/index.html into src/index.js (replaces __INDEX_HTML__ placeholder).
const fs = require("fs");
const path = require("path");
const root = __dirname;
let html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
// escape for JS template literal
html = html.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
let worker = fs.readFileSync(path.join(root, "src", "index.js"), "utf8");
if (!worker.includes("`__INDEX_HTML__`")) {
  // restore from the placeholder on rebuilds: strip previously embedded html
  worker = worker.replace(/const INDEX_HTML = `[\s\S]*?`;/, "const INDEX_HTML = `__INDEX_HTML__`;");
}
worker = worker.replace("`__INDEX_HTML__`", "`" + html + "`");
fs.writeFileSync(path.join(root, "src", "index.js"), worker);
console.log("embedded", Buffer.byteLength(html), "bytes of HTML into src/index.js");
