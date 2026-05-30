// Etiquetas advisory de "para que es bueno" cada modelo, para mostrarlas en el
// walker al permutar el modelo de un nodo (tecla `m`). Heuristica por nombre +
// proveedor; no es exhaustiva, solo una guia rapida para el editor humano.

export function modelTags(model: { name: string; provider: string }): string[] {
  const n = model.name.toLowerCase();
  const t: string[] = [];
  const add = (x: string) => {
    if (!t.includes(x)) t.push(x);
  };

  if (model.provider === "anthropic" || model.provider === "gemini") {
    add("frontera");
    add("web");
    add("prosa");
    add("razonamiento");
  }
  if (model.provider === "mock") add("test");

  if (n.includes("coder") || n.includes("starcoder")) {
    add("code");
    add("tools");
  }
  if (n.includes("devstral")) add("code");
  if (n.includes("math")) add("math");
  if (n.includes("r1") || n.includes("deepseek")) add("razonamiento");
  if (n.includes("embed") || n.includes("nomic")) add("embeddings");
  if (n.includes("granite")) {
    add("prosa");
    add("tools");
  }
  if (n.includes("qwen2.5") && !n.includes("coder")) {
    add("prosa");
    add("tools");
  }
  if (n.includes("llama")) {
    add("prosa");
    add("tools");
  }
  if (n.includes("phi")) add("general");

  if (t.length === 0) add("general");
  return t;
}
