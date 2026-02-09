import { routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { processToolCalls, cleanupMessages, limitMessages } from "./utils";
import { tools, executions } from "./tools";
import { getSystemPrompt } from "./system-prompt";

export class Chat extends AIChatAgent<Env> {
  /** Expose env publicly for tool access via getCurrentAgent() */
  getEnv(): Env {
    return this.env;
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    console.log("=== onChatMessage START ===");

    const allTools = { ...tools };

    // OpenRouter
    const openrouter = createOpenRouter({
      apiKey: this.env.OPENROUTER_API_KEY,
    });
    const model = openrouter.chat("moonshotai/kimi-k2.5");

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        console.log("=== execute() START ===");

        const limitedMessages = limitMessages(this.messages, 10);
        const cleanedMessages = cleanupMessages(limitedMessages);
        console.log("Cleaned messages count:", cleanedMessages.length);

        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });
        console.log("Processed messages count:", processedMessages.length);

        const modelMessages = await convertToModelMessages(processedMessages);
        console.log("Model messages count:", modelMessages.length);

        console.log("=== Calling streamText ===");

        const systemMessage = {
          role: "system" as const,
          content: getSystemPrompt(),
        };

        const result = streamText({
          messages: [systemMessage, ...modelMessages],
          model,
          tools: allTools,
          abortSignal: options?.abortSignal,
          onFinish: (event) => {
            console.log("=== onFinish ===", {
              finishReason: event.finishReason,
              steps: event.steps?.length,
              textLength: event.text?.length
            });
            console.log(
              "=== Cache Stats ===",
              JSON.stringify(event.providerMetadata, null, 2)
            );
            onFinish(event as unknown as Parameters<typeof onFinish>[0]);
          },
          stopWhen: stepCountIs(10),
          onStepFinish: (step) => {
            console.log("=== Step finished ===", {
              finishReason: step.finishReason,
              toolCalls: step.toolCalls?.length,
              toolResults: step.toolResults?.length,
              textLength: step.text?.length
            });
          }
        });

        console.log("=== Merging stream ===");
        writer.merge(result.toUIMessageStream());
        console.log("=== Stream merged ===");
      }
    });

    console.log("=== Returning response ===");
    return createUIMessageStreamResponse({ stream });
  }

  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          { type: "text", text: `Running scheduled task: ${description}` }
        ],
        metadata: { createdAt: new Date() }
      }
    ]);
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      return Response.json({ success: true });
    }
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
