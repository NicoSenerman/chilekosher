/** biome-ignore-all lint/correctness/useUniqueElementIds: it's alright */
import { useEffect, useState, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { isToolUIPart } from "ai";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import type { tools } from "./tools";

import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Textarea } from "@/components/textarea/Textarea";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";

import imageCompression from "browser-image-compression";

import {
  MoonIcon,
  SunIcon,
  PaperPlaneTiltIcon,
  StopIcon,
  CameraIcon,
  XIcon,
  PlusCircleIcon,
  ImageIcon
} from "@phosphor-icons/react";

const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "obtenerClima"
];

const getUserId = () => {
  const stored = localStorage.getItem("chile-kosher-user-id");
  if (stored) return stored;
  const newId = crypto.randomUUID();
  localStorage.setItem("chile-kosher-user-id", newId);
  return newId;
};

export default function Chat() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) return savedTheme as "dark" | "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const [showDebug, _setShowDebug] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState("auto");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showGalleryButton, setShowGalleryButton] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userScrolledUpRef = useRef(false);

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      if (smooth) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth"
        });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // Detect when user scrolls up (to pause auto-scroll during streaming)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        userScrolledUpRef.current = true;
      }
    };

    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      const touchY = e.touches[0].clientY;
      if (touchY > touchStartY + 10) {
        userScrolledUpRef.current = true;
      }
      touchStartY = touchY;
    };

    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  useEffect(() => {
    // Show gallery button only on Android when installed as PWA
    // iOS shows native picker with both options even in standalone mode
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const isAndroid = /android/i.test(navigator.userAgent);
    
    const updateShowGallery = () => {
      setShowGalleryButton(mediaQuery.matches && isAndroid);
    };
    
    updateShowGallery();
    
    const handleChange = () => updateShowGallery();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const handleViewportResize = () => {
      setTimeout(() => scrollToBottom(false), 50);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportResize);
      window.visualViewport.addEventListener("scroll", handleViewportResize);
      return () => {
        window.visualViewport?.removeEventListener(
          "resize",
          handleViewportResize
        );
        window.visualViewport?.removeEventListener(
          "scroll",
          handleViewportResize
        );
      };
    }
  }, [scrollToBottom]);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  const agent = useAgent({
    agent: "chat",
    name: getUserId()
  });

  const [agentInput, setAgentInput] = useState("");
  const handleAgentInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setAgentInput(e.target.value);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    try {
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1024,
        useWebWorker: true
      };
      const compressedFile = await imageCompression(file, options);

      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setIsCompressing(false);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error("Error compressing image:", error);
      setIsCompressing(false);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const handleAgentSubmit = async (
    e: React.FormEvent,
    extraData: Record<string, unknown> = {}
  ) => {
    e.preventDefault();
    if (!agentInput.trim() && !selectedImage) return;

    const message = agentInput;
    setAgentInput("");
    setTextareaHeight("auto");

    const imageSrc = selectedImage;
    clearImage();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const getMediaType = (dataUrl: string) => {
      const match = dataUrl.match(/^data:(.+?);base64,/);
      return match ? match[1] : "image/jpeg";
    };

    type FilePart = { type: "file"; mediaType: string; url: string };
    type TextPart = { type: "text"; text: string };

    const parts: Array<TextPart | FilePart> = [];

    if (imageSrc) {
      parts.push({
        type: "file",
        mediaType: getMediaType(imageSrc),
        url: imageSrc
      });
    }

    parts.push({
      type: "text",
      text: message || "¿Este producto es kosher?"
    });

    await sendMessage({ role: "user", parts }, { body: extraData });
  };

  const {
    messages: agentMessages,
    addToolResult,
    clearHistory,
    status,
    sendMessage,
    stop: originalStop
  } = useAgentChat<unknown, UIMessage<{ createdAt: string }>>({
    agent
  });

  const cancelledToolIdsRef = useRef<Set<string>>(new Set());

  // Wrapped stop that marks in-flight tools as cancelled
  const stop = useCallback(() => {
    agentMessages.forEach((msg: UIMessage) => {
      msg.parts?.forEach((part) => {
        if (isToolUIPart(part) && part.toolCallId && part.state !== "output-available") {
          cancelledToolIdsRef.current.add(part.toolCallId);
        }
      });
    });
    originalStop();
  }, [agentMessages, originalStop]);

  useEffect(() => {
    if (agentMessages.length > 0 && !userScrolledUpRef.current) {
      scrollToBottom();
    }
  }, [agentMessages, scrollToBottom]);

  // Reset scroll lock when streaming finishes (ready for next message)
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (
      (prevStatusRef.current === "streaming" || prevStatusRef.current === "submitted") &&
      status === "ready"
    ) {
      userScrolledUpRef.current = false;
    }
    prevStatusRef.current = status;
  }, [status]);

  const pendingToolCallConfirmation = agentMessages.some((m: UIMessage) =>
    m.parts?.some(
      (part) =>
        isToolUIPart(part) &&
        part.state === "input-available" &&
        toolsRequiringConfirmation.includes(
          part.type.replace("tool-", "") as keyof typeof tools
        )
    )
  );

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const lastAssistantHasText = agentMessages
    .filter((m) => m.role === "assistant")
    .slice(-1)[0]
    ?.parts?.some((p) => p.type === "text" && p.text?.trim());

  const showTypingIndicator =
    (status === "submitted" || status === "streaming") && !lastAssistantHasText;

  return (
    <div className="h-[100dvh] w-full flex justify-center items-center bg-fixed overflow-hidden md:p-4">
      <div className="h-full md:h-[calc(100dvh-2rem)] w-full mx-auto max-w-lg flex flex-col shadow-xl md:rounded-md overflow-hidden relative border-0 md:border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-950">
        <header
          className="px-4 py-3 border-b border-neutral-300 dark:border-neutral-800 flex items-center gap-3 bg-white dark:bg-neutral-950 flex-shrink-0 z-10"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <div className="relative">
            <div className="h-10 w-10 rounded-full overflow-hidden flex-shrink-0">
              <img
                src="/logock.png"
                alt="Chile Kosher"
                className="h-full w-full object-cover"
              />
            </div>
            <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 border-2 border-white dark:border-neutral-950 rounded-full" />
          </div>

          <div className="flex-1">
            <h2 className="font-semibold text-base text-[#4A6D7C]">
              Chile Kosher
            </h2>
          </div>

          <Button
            variant="ghost"
            size="md"
            shape="square"
            className="rounded-full h-9 w-9 touch-manipulation"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <SunIcon size={20} /> : <MoonIcon size={20} />}
          </Button>

          </header>

        <div
          ref={messagesContainerRef}
          data-scrollable="true"
          className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain"
          style={{
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            msOverflowStyle: "none"
          }}
        >
          {agentMessages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <Card className="p-6 max-w-md mx-auto bg-neutral-100 dark:bg-neutral-900">
                <div className="text-center space-y-4">
                  <div className="h-16 w-16 rounded-full overflow-hidden mx-auto">
                    <img
                      src="/logock.png"
                      alt="Chile Kosher"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <h3 className="font-semibold text-lg text-[#4A6D7C]">
                    ¡Shalom! 👋
                  </h3>
                  <p className="text-[#7D756E] text-sm">
                    Soy tu asistente de Chile Kosher. Puedo ayudarte con:
                  </p>
                  <ul className="text-sm text-left space-y-2">
                    <li className="flex items-center gap-2">
                      <span className="text-[#4A6D7C]">•</span>
                      <span>Verificar si un producto es kosher</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-[#4A6D7C]">•</span>
                      <span>Encontrar restaurantes y tiendas kosher</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-[#4A6D7C]">•</span>
                      <span>Información sobre certificaciones</span>
                    </li>
                  </ul>
                </div>
              </Card>
            </div>
          )}

          {agentMessages
            .filter((m) => {
              if (m.role === "assistant") {
                const hasContent = m.parts?.some(
                  (p) =>
                    (p.type === "text" && p.text?.trim()) || isToolUIPart(p)
                );
                return hasContent;
              }
              return true;
            })
            .map((m, index, filteredMessages) => {
              const isUser = m.role === "user";
              const showAvatar =
                index === 0 || filteredMessages[index - 1]?.role !== m.role;

              if (isUser) {
                return (
                  <div key={m.id}>
                    {showDebug && (
                      <pre className="text-xs text-muted-foreground overflow-scroll">
                        {JSON.stringify(m, null, 2)}
                      </pre>
                    )}
                    <div className="flex justify-end">
                      <div className="flex gap-2 max-w-[85%] min-w-0 items-start flex-row-reverse">
                        <div className="min-w-0">
                          {m.parts?.map((part, i) => {
                            if (part.type === "file" && "url" in part) {
                              const url = (part as { url: string }).url;
                              if (url.startsWith("data:image/")) {
                                return (
                                  <div key={i} className="mb-2">
                                    <img
                                      src={url}
                                      alt="Uploaded"
                                      className="max-w-[150px] max-h-[150px] object-cover rounded-lg"
                                    />
                                  </div>
                                );
                              }
                              return null;
                            }
                            if (part.type === "text") {
                              if (!part.text || !part.text.trim()) {
                                return null;
                              }
                              return (
                                <div key={i}>
                                  <Card
                                    className={`p-3 rounded-md overflow-hidden w-fit rounded-br-none bg-neutral-100 dark:bg-neutral-900 ${
                                      part.text.startsWith("scheduled message")
                                        ? "border-accent/50"
                                        : ""
                                    } relative`}
                                  >
                                    {part.text.startsWith(
                                      "scheduled message"
                                    ) && (
                                      <span className="absolute -top-3 -left-2 text-base">
                                        🕒
                                      </span>
                                    )}
                                    <MemoizedMarkdown
                                      id={`${m.id}-${i}`}
                                      content={part.text.replace(
                                        /^scheduled message: /,
                                        ""
                                      )}
                                    />
                                  </Card>
                                  <p className="text-xs text-muted-foreground mt-1 text-right">
                                    {formatTime(
                                      m.metadata?.createdAt
                                        ? new Date(m.metadata.createdAt)
                                        : new Date()
                                    )}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id}>
                  {showDebug && (
                    <pre className="text-xs text-muted-foreground overflow-scroll">
                      {JSON.stringify(m, null, 2)}
                    </pre>
                  )}
                  <div className="flex justify-start">
                    <div className="max-w-[95%] md:max-w-[85%]">
                      {showAvatar && (
                        <div className="mb-1">
                          <div className="h-9 w-9 rounded-full overflow-hidden">
                            <img
                              src="/logock.png"
                              alt="Chile Kosher"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        </div>
                      )}
                      <div className="pl-2">
                        {m.parts?.map((part, i) => {
                          if (part.type === "text") {
                            if (!part.text || !part.text.trim()) {
                              return null;
                            }
                            return (
                              <div key={i}>
                                <Card
                                  className={`p-3 rounded-md overflow-hidden rounded-bl-none bg-neutral-100 dark:bg-neutral-900 border-assistant-border ${
                                    part.text.startsWith("scheduled message")
                                      ? "border-accent/50"
                                      : ""
                                  } relative`}
                                >
                                  {part.text.startsWith(
                                    "scheduled message"
                                  ) && (
                                    <span className="absolute -top-3 -left-2 text-base">
                                      🕒
                                    </span>
                                  )}
                                  <MemoizedMarkdown
                                    id={`${m.id}-${i}`}
                                    content={part.text.replace(
                                      /^scheduled message: /,
                                      ""
                                    )}
                                  />
                                </Card>
                                <p className="text-xs text-muted-foreground mt-1 text-left">
                                  {formatTime(
                                    m.metadata?.createdAt
                                      ? new Date(m.metadata.createdAt)
                                      : new Date()
                                  )}
                                </p>
                              </div>
                            );
                          }

                          if (isToolUIPart(part) && m.role === "assistant") {
                            const toolCallId = part.toolCallId;
                            const toolName = part.type.replace("tool-", "");
                            const needsConfirmation =
                              toolsRequiringConfirmation.includes(
                                toolName as keyof typeof tools
                              );

                            return (
                              <ToolInvocationCard
                                key={`${toolCallId}-${i}`}
                                toolUIPart={part}
                                toolCallId={toolCallId}
                                needsConfirmation={needsConfirmation}
                                chatStatus={status}
                                cancelledToolIds={cancelledToolIdsRef.current}
                                onSubmit={({ toolCallId, result }) => {
                                  addToolResult({
                                    tool: part.type.replace("tool-", ""),
                                    toolCallId,
                                    output: result
                                  });
                                }}
                                addToolResult={(toolCallId, result) => {
                                  addToolResult({
                                    tool: part.type.replace("tool-", ""),
                                    toolCallId,
                                    output: result
                                  });
                                }}
                              />
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

          {showTypingIndicator && (
            <div className="flex justify-start">
              <div className="max-w-[95%] md:max-w-[85%]">
                <div className="mb-1">
                  <div className="h-9 w-9 rounded-full overflow-hidden">
                    <img
                      src="/logock.png"
                      alt="Chile Kosher"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
                <div className="pl-2">
                  <Card className="p-3 rounded-md rounded-bl-none bg-neutral-100 dark:bg-neutral-900 w-fit">
                    <div className="flex items-center gap-1">
                      <span
                        className="w-2 h-2 bg-neutral-400 dark:bg-neutral-500 rounded-full animate-bounce"
                        style={{
                          animationDelay: "0ms",
                          animationDuration: "1s"
                        }}
                      />
                      <span
                        className="w-2 h-2 bg-neutral-400 dark:bg-neutral-500 rounded-full animate-bounce"
                        style={{
                          animationDelay: "150ms",
                          animationDuration: "1s"
                        }}
                      />
                      <span
                        className="w-2 h-2 bg-neutral-400 dark:bg-neutral-500 rounded-full animate-bounce"
                        style={{
                          animationDelay: "300ms",
                          animationDuration: "1s"
                        }}
                      />
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-1" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAgentSubmit(e, {
              annotations: {
                hello: "world"
              }
            });
          }}
          className="p-3 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-300 dark:border-neutral-800 flex-shrink-0"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            capture={showGalleryButton ? "environment" : undefined}
            onChange={handleImageSelect}
            className="hidden"
          />
          <input
            type="file"
            ref={galleryInputRef}
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          {(selectedImage || isCompressing) && (
            <div className="flex items-center gap-2 mb-2">
              {selectedImage && (
                <div className="relative">
                  <img
                    src={selectedImage}
                    alt="Preview"
                    className="h-16 w-16 object-cover rounded-lg border border-neutral-300 dark:border-neutral-700"
                  />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 transition-colors"
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              )}
              {isCompressing && (
                <span className="text-sm text-neutral-500">Comprimiendo...</span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressing}
                className="inline-flex items-center gap-2 cursor-pointer justify-center rounded-full px-4 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors touch-manipulation active:scale-95 disabled:opacity-50 text-sm font-medium"
                aria-label="Tomar foto"
              >
                <CameraIcon size={20} />
                <span>Foto</span>
              </button>
              {showGalleryButton && (
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={isCompressing}
                  className="inline-flex items-center gap-2 cursor-pointer justify-center rounded-full px-4 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors touch-manipulation active:scale-95 disabled:opacity-50 text-sm font-medium"
                  aria-label="Seleccionar de galería"
                >
                  <ImageIcon size={20} />
                  <span>Galería</span>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={clearHistory}
              className="inline-flex items-center gap-2 cursor-pointer justify-center rounded-full px-4 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors touch-manipulation active:scale-95 text-sm font-medium"
              aria-label="Nueva conversación"
            >
              <PlusCircleIcon size={20} />
              <span>Nuevo Chat</span>
            </button>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                disabled={pendingToolCallConfirmation}
                placeholder={
                  pendingToolCallConfirmation
                    ? "Por favor responde a la confirmación..."
                    : "Escribe un mensaje..."
                }
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 ring-offset-background placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-700 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] max-h-[120px] overflow-y-auto resize-none rounded-2xl text-base pb-10 dark:bg-neutral-900 touch-manipulation"
                style={{
                  fontSize: "16px",
                  height: textareaHeight
                }}
                value={agentInput}
                onChange={(e) => {
                  handleAgentInputChange(e);
                  e.target.style.height = "auto";
                  const newHeight = Math.min(e.target.scrollHeight, 120);
                  e.target.style.height = `${newHeight}px`;
                  setTextareaHeight(`${newHeight}px`);
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    handleAgentSubmit(e as unknown as React.FormEvent);
                  }
                }}
                onFocus={() => {
                  setTimeout(() => scrollToBottom(false), 300);
                }}
                rows={1}
              />
              <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
                {status === "submitted" || status === "streaming" ? (
                  <button
                    type="button"
                    onClick={stop}
                    className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-1.5 h-fit border border-neutral-200 dark:border-neutral-800 touch-manipulation active:scale-95 transition-transform"
                    aria-label="Stop generation"
                  >
                    <StopIcon size={16} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-1.5 h-fit border border-neutral-200 dark:border-neutral-800 touch-manipulation active:scale-95 transition-transform"
                    disabled={
                      pendingToolCallConfirmation ||
                      (!agentInput.trim() && !selectedImage)
                    }
                    aria-label="Send message"
                  >
                    <PaperPlaneTiltIcon size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
