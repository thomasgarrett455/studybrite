import type { DiagramNode, DiagramEdge } from "./api";

// Characters that terminate mermaid tokens: `"` closes a node label, `|`
// closes an edge label. Strip them (plus newlines) rather than escaping —
// concept labels never need them anyway.
function clean(label: string): string {
  return label.replace(/["|\n\r`]/g, " ").replace(/\s+/g, " ").trim();
}

// Build mermaid flowchart source from a validated node/edge graph. LLM node
// ids never appear in the source — they're remapped to n0..nN so an odd id
// (spaces, punctuation, a reserved word) can't break the syntax.
export function toMermaid(nodes: DiagramNode[], edges: DiagramEdge[]): string {
  const idMap = new Map<string, string>();
  nodes.forEach((n, i) => idMap.set(n.id, `n${i}`));

  const lines = ["graph TD"];
  for (const n of nodes) {
    lines.push(`  ${idMap.get(n.id)}["${clean(n.label)}"]`);
  }
  for (const e of edges) {
    const from = idMap.get(e.from);
    const to = idMap.get(e.to);
    if (!from || !to) continue;
    const label = e.label ? clean(e.label) : "";
    lines.push(label ? `  ${from} -->|"${label}"| ${to}` : `  ${from} --> ${to}`);
  }
  return lines.join("\n");
}
