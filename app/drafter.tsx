"use client";
import { useState } from "react";

type P = { id: string; title: string };
type Q = { id: string; productId: string; text: string; firstName: string };
type Draft = { reply: string; status: string; page_evidence: string[] };

export default function Drafter({ products, questions }: { products: P[]; questions: Q[] }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [firstName, setFirstName] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function loadSample(id: string) {
    const q = questions.find((x) => x.id === id);
    if (!q) return;
    setProductId(q.productId); setQuestion(q.text); setFirstName(q.firstName); setDraft(null);
  }

  async function submit() {
    setLoading(true); setError(""); setDraft(null);
    const res = await fetch("/api/draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, question, firstName }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error); else setDraft(data);
    setLoading(false);
  }

  const field = { display: "block", width: "100%", padding: 8, marginTop: 4, marginBottom: 12, boxSizing: "border-box" as const };
  return (
    <div>
      <label>Load a sample question
        <select style={field} defaultValue="" onChange={(e) => loadSample(e.target.value)}>
          <option value="" disabled>Choose…</option>
          {questions.map((q) => <option key={q.id} value={q.id}>{q.id} · {q.text.slice(0, 70)}</option>)}
        </select>
      </label>
      <label>Product page
        <select style={field} value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}
        </select>
      </label>
      <label>Shopper first name
        <input style={field} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      </label>
      <label>Question
        <textarea style={{ ...field, minHeight: 90 }} value={question} onChange={(e) => setQuestion(e.target.value)} />
      </label>
      <button onClick={submit} disabled={loading || !question} style={{ padding: "8px 16px" }}>
        {loading ? "Drafting…" : "Draft reply"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {draft && (
        <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
          <strong>Status: {draft.status}</strong>
          <p>{draft.reply}</p>
          {draft.page_evidence.length > 0 && (
            <details><summary>Page evidence</summary><ul>{draft.page_evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></details>
          )}
        </section>
      )}
    </div>
  );
}
