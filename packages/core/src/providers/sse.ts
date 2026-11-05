export interface SseMessage {
  event: string;
  data: string;
}

/**
 * Leitor de Server-Sent Events tolerante a particionamento de chunks.
 * Aceita `\n` e `\r\n`, ignora comentários (`:`) e devolve cada evento completo.
 */
export async function* parseSse(
  body: AsyncIterable<Uint8Array>,
): AsyncGenerator<SseMessage, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "";
  let data: string[] = [];

  const flush = (): SseMessage | null => {
    if (data.length === 0 && !event) return null;
    const message: SseMessage = { event: event || "message", data: data.join("\n") };
    event = "";
    data = [];
    return message;
  };

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });

    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const raw = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

      if (line === "") {
        const message = flush();
        if (message) yield message;
      } else if (line.startsWith(":")) {
        // comentário de keep-alive
      } else if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data.push(line.slice(5).trimStart());
      }

      index = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    else if (line.startsWith("event:")) event = line.slice(6).trim();
  }
  const last = flush();
  if (last) yield last;
}
