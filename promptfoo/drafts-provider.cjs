// Returns the stored draft for a question from out/drafts.csv, so promptfoo grades exactly what the drafter produced.
const fs = require("node:fs");
const path = require("node:path");

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
module.exports = { parseCsv };

let drafts;
class DraftsProvider {
  id() { return "stored-drafts"; }
  async callApi(_prompt, context) {
    drafts ??= new Map(parseCsv(fs.readFileSync(path.join(process.cwd(), "out", "drafts.csv"), "utf8")).map((r) => [r.question_id, r]));
    const d = drafts.get(context.vars.question_id);
    if (!d) return { error: `no draft for ${context.vars.question_id}` };
    return { output: d.reply };
  }
}
module.exports = DraftsProvider;
module.exports.parseCsv = parseCsv;
