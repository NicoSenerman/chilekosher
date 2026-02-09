import { useState, useEffect, useId, useRef } from "react";
import type { ToolUIPart } from "ai";
import { MagnifyingGlassIcon, CaretDownIcon } from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";
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
  "tool-cancelarTareaProgramada": "Cancelando tarea",
  "tool-web_search": "Buscando en internet",
  "tool-web_fetch": "Leyendo página web",
};

// --- SVG Sub-components ---

function ProgressRing({ className, uniqueId }: { className: string; uniqueId: string }) {
  return (
    <svg className={className} viewBox="0 0 22 22">
      <title>Cargando</title>
      <defs>
        <linearGradient id={`progress-grad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4A6D7C" />
          <stop offset="100%" stopColor="#3A5A68" />
        </linearGradient>
      </defs>
      <circle
        cx="11" cy="11" r="9"
        fill="none"
        stroke="#4A6D7C"
        strokeWidth="2"
        opacity="0.2"
      />
      <circle
        cx="11" cy="11" r="9"
        fill="none"
        stroke={`url(#progress-grad-${uniqueId})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        className="tool-progress-arc"
      />
    </svg>
  );
}

function CompletionBadge({ className, uniqueId }: { className: string; uniqueId: string }) {
  return (
    <svg className={className} viewBox="0 0 22 22">
      <title>Completado</title>
      <defs>
        <linearGradient id={`complete-grad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4A6D7C" />
          <stop offset="100%" stopColor="#3A5A68" />
        </linearGradient>
      </defs>
      <circle
        cx="11" cy="11" r="9"
        fill={`url(#complete-grad-${uniqueId})`}
        className="tool-badge-circle"
      />
      <path
        d="M7 11.5L10 14.5L15 8.5"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="tool-badge-check"
      />
    </svg>
  );
}

function CancelledBadge({ className, uniqueId }: { className: string; uniqueId: string }) {
  return (
    <svg className={className} viewBox="0 0 22 22">
      <title>Cancelado</title>
      <defs>
        <linearGradient id={`cancel-grad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#b45309" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>
      <circle
        cx="11" cy="11" r="9"
        fill={`url(#cancel-grad-${uniqueId})`}
        className="tool-badge-circle"
      />
      <path
        d="M8 8L14 14M14 8L8 14"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        className="tool-badge-cross"
      />
    </svg>
  );
}

// --- Main Component ---

interface ToolInvocationCardProps {
  toolUIPart: ToolUIPart;
  toolCallId: string;
  needsConfirmation: boolean;
  startTime?: number;
  chatStatus?: string;
  cancelledToolIds?: Set<string>;
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
  chatStatus,
  cancelledToolIds,
  onSubmit
}: ToolInvocationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const uniqueId = useId();
  // Always use mount time — the server-side tool execution starts before the
  // WebSocket message reaches the client, so any externally-provided startTime
  // would already be stale.  Counting from mount keeps the timer at 0s on appear.
  const mountTimeRef = useRef<number>(Date.now());
  const effectiveStartTime = mountTimeRef.current;

  // Determine states
  const isComplete = toolUIPart.state === "output-available" && !needsConfirmation;

  // Detect cancelled: check persisted set first, then current status
  const wasPreviouslyCancelled = cancelledToolIds?.has(toolCallId) ?? false;
  const isCurrentlyNotStreaming = chatStatus !== undefined && chatStatus !== "streaming" && chatStatus !== "submitted";
  const isCancelled =
    !isComplete &&
    !needsConfirmation &&
    toolUIPart.state !== "output-available" &&
    (wasPreviouslyCancelled || isCurrentlyNotStreaming);

  const isLoading = toolUIPart.state !== "output-available" && !needsConfirmation && !isCancelled;

  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [finalTime, setFinalTime] = useState<number | null>(null);

  // Timer effect
  useEffect(() => {
    if (!isLoading) {
      // Capture final time when loading completes or is cancelled
      if (finalTime === null && (isComplete || isCancelled)) {
        setFinalTime(Math.round((Date.now() - effectiveStartTime) / 1000));
      }
      return;
    }

    // Set initial elapsed time immediately
    setElapsedTime(Math.round((Date.now() - effectiveStartTime) / 1000));

    const interval = setInterval(() => {
      setElapsedTime(Math.round((Date.now() - effectiveStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoading, isComplete, isCancelled, finalTime, effectiveStartTime]);

  const displayName =
    toolDisplayNames[toolUIPart.type] || toolUIPart.type.replace("tool-", "");

  // Time to display - show final time when complete or cancelled, otherwise show elapsed
  const displayTime = (isComplete || isCancelled) ? finalTime : elapsedTime;

  const containerClass = isCancelled
    ? "p-3 my-2 w-full max-w-[500px] rounded-md bg-[#4A6D7C]/5 dark:bg-[#4A6D7C]/10 border border-[#4A6D7C]/20 overflow-hidden opacity-75"
    : "p-3 my-2 w-full max-w-[500px] rounded-md bg-[#4A6D7C]/5 dark:bg-[#4A6D7C]/10 border border-[#4A6D7C]/20 overflow-hidden";

  return (
    <div className={containerClass}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 cursor-pointer min-h-[28px]"
      >
        <div
          className={`${needsConfirmation ? "bg-[#4A6D7C]/20" : "bg-[#4A6D7C]/10"} p-1.5 rounded-full flex-shrink-0`}
        >
          <MagnifyingGlassIcon size={14} className="text-[#4A6D7C]" />
        </div>

        {/* Display name with shimmer when loading */}
        <span
          className={`text-sm flex items-center gap-2 flex-1 text-left font-medium ${
            isLoading
              ? "tool-shimmer"
              : isCancelled
                ? "text-[#4A6D7C]/50"
                : "text-[#4A6D7C]"
          }`}
        >
          {displayName}
        </span>

        {/* Time and status indicator — fixed width to prevent layout jumps */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs tabular-nums min-w-[2ch] text-right ${displayTime !== null && displayTime > 0 ? "text-[#4A6D7C]/50" : "text-transparent"}`}>
            {displayTime !== null && displayTime > 0 ? `${displayTime}s` : "\u00A0"}
          </span>
          <div className="w-5 h-5 flex-shrink-0">
            {isLoading && (
              <ProgressRing className="w-5 h-5" uniqueId={uniqueId} />
            )}
            {isComplete && (
              <CompletionBadge className="w-5 h-5" uniqueId={uniqueId} />
            )}
            {isCancelled && (
              <CancelledBadge className="w-5 h-5" uniqueId={uniqueId} />
            )}
          </div>
        </div>

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
    </div>
  );
}
