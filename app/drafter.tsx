"use client";
import { useEffect, useState } from "react";

type P = { id: string; title: string };
type Q = { id: string; productId: string; text: string; firstName: string };
type Draft = { reply: string; status: string; page_evidence: string[]; draft_id: string; token: string };

export default function Drafter({ products, questions }: { products: P[]; questions: Q[] }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [firstName, setFirstName] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [questionId, setQuestionId] = useState("");
  const [edited, setEdited] = useState("");
  const [outcome, setOutcome] = useState("");

  function loadSample(id: string) {
    const q = questions.find((x) => x.id === id);
    if (!q) return;
    setProductId(q.productId); setQuestion(q.text); setFirstName(q.firstName); setQuestionId(q.id); setDraft(null);
    return q;
  }

  // Deep link: /?q=Q-123 opens that shopper question and drafts a reply.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("q");
    const q = id ? loadSample(id) : undefined;
    if (q) submit({ productId: q.productId, question: q.text, firstName: q.firstName, questionId: q.id, trigger: "deep_link" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(input: { productId: string; question: string; firstName: string; questionId: string; trigger?: string } = { productId, question, firstName, questionId }) {
    setLoading(true); setError(""); setDraft(null); setOutcome("");
    const res = await fetch("/api/draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, questionId: input.questionId || undefined }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error); else { setDraft(data); setEdited(data.reply); }
    setLoading(false);
  }

  // Logs the merchant's decision. "Send" here records the outcome only; it does not message a shopper.
  async function decide(action: "send" | "discard") {
    if (!draft) return;
    const res = await fetch("/api/draft/outcome", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: draft.token, action, reply: edited }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error); else setOutcome(data.outcome);
  }

  const field = { display: "block", width: "100%", padding: 8, marginTop: 4, marginBottom: 12, boxSizing: "border-box" as const };
  return (
    <div>
      <label>Load a sample question
        <select style={field} value={questionId} onChange={(e) => loadSample(e.target.value)}>
          <option value="" disabled>Choose a shopper question…</option>
          {questions.map((q) => <option key={q.id} value={q.id}>{q.id} · {q.firstName}: {q.text.slice(0, 70)}</option>)}
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
      <button onClick={() => submit()} disabled={loading || !question} style={{ padding: "8px 16px" }}>
        {loading ? "Drafting…" : "Draft reply"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {draft && (
        <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
          <strong>Status: {draft.status}</strong>
          <textarea style={{ ...field, minHeight: 90 }} value={edited} disabled={!!outcome} onChange={(e) => setEdited(e.target.value)} />
          {outcome ? <p>Recorded: {outcome.replace("_", " ")}</p> : (
            <p>
              <button onClick={() => decide("send")} style={{ padding: "8px 16px", marginRight: 8 }}>{edited === draft.reply ? "Send" : "Send edited"}</button>
              <button onClick={() => decide("discard")} style={{ padding: "8px 16px" }}>Discard</button>
            </p>
          )}
          {draft.page_evidence.length > 0 && (
            <details><summary>Page evidence</summary><ul>{draft.page_evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></details>
          )}
        </section>
      )}
    </div>
  );
}
