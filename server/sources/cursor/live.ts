// Eventos dos hooks do Cursor (a parte "ao vivo" da fonte): o script de hook manda o stdin do evento para
// POST /api/cursor/events e a rota repassa aqui. A fonte do Cursor (sources/cursor/source.ts) implementa.

export interface CursorLive {
  /**
   * Aplica um evento de hook do Cursor (stdin: `hook_event_name`, `conversation_id` / `session_id`,
   * `workspace_roots`, `cwd`, `tool_name`, …) ao escritório. `account` = conta de quem mandou. Devolve false
   * para evento desconhecido ou sessão que não casa com nenhuma conta.
   */
  applyHookEvent(account: string | undefined, input: Record<string, unknown>): boolean;
}
