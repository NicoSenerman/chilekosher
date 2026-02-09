import { useState } from "react";
import type { ToolUIPart } from "ai";
import { MagnifyingGlassIcon, CaretDownIcon } from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { APPROVAL } from "@/shared";

interface ToolResultWithContent {
  content: Array<{ type: string; text: string }>;
}

function isToolResultWithContent(
  result: unknown
): result is ToolResultWithContent {
  return (
    typeof result === "object" &&
    result !== null &&
    "content" in result &&
    Array.isArray((result as ToolResultWithContent).content)
  );
}

// Friendly names for tools
const toolDisplayNames: Record<string, string> = {
  "tool-buscarProductosKosher": "Buscando productos kosher",
  "tool-buscarLugaresKosher": "Buscando lugares kosher",
  "tool-obtenerClima": "Consultando el clima",
  "tool-obtenerHoraLocal": "Consultando hora local",
  "tool-programarTarea": "Programando tarea",
  "tool-obtenerTareasProgramadas": "Listando tareas",
  "tool-cancelarTareaProgramada": "Cancelando tarea"
};

interface ToolInvocationCardProps {
  toolUIPart: ToolUIPart;
  toolCallId: string;
  needsConfirmation: boolean;
  onSubmit: ({
    toolCallId,
    result
  }: {
    toolCallId: string;
    result: string;
  }) => void;
  addToolResult: (toolCallId: string, result: string) => void;
}

export function ToolInvocationCard({
  toolUIPart,
  toolCallId,
  needsConfirmation,
  onSubmit
}: ToolInvocationCardProps) {
  // Collapsed by default
  const [isExpanded, setIsExpanded] = useState(false);

  // Get friendly display name
  const displayName =
    toolDisplayNames[toolUIPart.type] || toolUIPart.type.replace("tool-", "");

  return (
    <Card className="p-3 my-2 w-full max-w-[500px] rounded-md bg-[#4A6D7C]/5 dark:bg-[#4A6D7C]/10 border border-[#4A6D7C]/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 cursor-pointer"
      >
        <div
          className={`${needsConfirmation ? "bg-[#4A6D7C]/20" : "bg-[#4A6D7C]/10"} p-1.5 rounded-full flex-shrink-0`}
        >
          <MagnifyingGlassIcon size={14} className="text-[#4A6D7C]" />
        </div>
        <span className="text-sm text-[#4A6D7C] flex items-center gap-2 flex-1 text-left">
          {displayName}
          {!needsConfirmation && toolUIPart.state === "output-available" && (
            <span className="text-xs text-[#4A6D7C]/70">✓</span>
          )}
        </span>
        <CaretDownIcon
          size={14}
          className={`text-[#4A6D7C]/50 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`transition-all duration-200 ${isExpanded ? "max-h-[200px] opacity-100 mt-3" : "max-h-0 opacity-0 overflow-hidden"}`}
      >
        <div
          className="overflow-y-auto"
          style={{ maxHeight: isExpanded ? "180px" : "0px" }}
        >
          <div className="mb-3">
            <h5 className="text-xs font-medium mb-1 text-[#7D756E]">
              Consulta:
            </h5>
            <pre className="bg-white/50 dark:bg-neutral-900/50 p-2 rounded-md text-xs overflow-auto whitespace-pre-wrap break-words max-w-[450px] text-[#7D756E]">
              {JSON.stringify(toolUIPart.input, null, 2)}
            </pre>
          </div>

          {needsConfirmation && toolUIPart.state === "input-available" && (
            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onSubmit({ toolCallId, result: APPROVAL.NO })}
              >
                Rechazar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onSubmit({ toolCallId, result: APPROVAL.YES })}
              >
                Aprobar
              </Button>
            </div>
          )}

          {!needsConfirmation && toolUIPart.state === "output-available" && (
            <div className="mt-3 border-t border-[#4A6D7C]/10 pt-3">
              <h5 className="text-xs font-medium mb-1 text-[#7D756E]">
                Resultado:
              </h5>
              <pre className="bg-white/50 dark:bg-neutral-900/50 p-2 rounded-md text-xs overflow-auto whitespace-pre-wrap break-words max-w-[450px] text-[#7D756E]">
                {(() => {
                  const result = toolUIPart.output;
                  if (isToolResultWithContent(result)) {
                    return result.content
                      .map((item: { type: string; text: string }) => {
                        if (
                          item.type === "text" &&
                          item.text.startsWith("\n~ Page URL:")
                        ) {
                          const lines = item.text.split("\n").filter(Boolean);
                          return lines
                            .map(
                              (line: string) => `- ${line.replace("\n~ ", "")}`
                            )
                            .join("\n");
                        }
                        return item.text;
                      })
                      .join("\n");
                  }
                  return JSON.stringify(result, null, 2);
                })()}
              </pre>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
