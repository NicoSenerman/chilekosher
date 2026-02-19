/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";

/**
 * AI Search indexes with fallback support
 */
const AI_SEARCH_INDEXES = ["chile-kosher-search-v2", "chile-kosher-search"] as const;

/**
 * Search with fallback - tries primary index, falls back to secondary if it fails
 */
async function searchWithFallback(
  ai: Ai,
  query: string,
  folder: string,
  maxResults: number = 10
): Promise<{ data: Array<{ filename: string; content: { text: string }[] }> | null; usedIndex: string }> {
  for (const indexName of AI_SEARCH_INDEXES) {
    try {
      console.log(`[searchWithFallback] Trying index: ${indexName}`);

      const searchResults = await ai.autorag(indexName).search({
        query,
        max_num_results: maxResults,
        filters: {
          type: "eq",
          key: "folder",
          value: folder
        }
      });

      console.log(`[searchWithFallback] ${indexName} raw response: ${JSON.stringify({ dataLength: searchResults.data?.length, hasMore: searchResults.has_more, query: searchResults.search_query, filenames: searchResults.data?.map((d: any) => d.filename) })}`);

      if (searchResults.data && searchResults.data.length > 0) {
        console.log(`[searchWithFallback] Success with ${indexName}: ${searchResults.data.length} results`);
        return { data: searchResults.data, usedIndex: indexName };
      }

      console.log(`[searchWithFallback] ${indexName} returned 0 results, trying next...`);
    } catch (error) {
      console.error(`[searchWithFallback] ${indexName} failed:`, error);
      // Continue to next index
    }
  }

  return { data: null, usedIndex: "none" };
}

/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 */
const obtenerClima = tool({
  description: "mostrar el clima en una ciudad al usuario",
  inputSchema: z.object({ ciudad: z.string() })
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const obtenerHoraLocal = tool({
  description: "obtener la hora local de una ubicación específica",
  inputSchema: z.object({ ubicacion: z.string() }),
  execute: async ({ ubicacion }) => {
    console.log(`Getting local time for ${ubicacion}`);
    return "10am";
  }
});

const programarTarea = tool({
  description: "Programar una tarea para ejecutarse más tarde",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Entrada de programación no válida";
    }
    const input =
      when.type === "scheduled"
        ? when.date
        : when.type === "delayed"
          ? when.delayInSeconds
          : when.type === "cron"
            ? when.cron
            : throwError("entrada de programación no válida");
    try {
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error al programar tarea: ${error}`;
    }
    return `Tarea programada para tipo "${when.type}" : ${input}`;
  }
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const obtenerTareasProgramadas = tool({
  description: "Listar todas las tareas programadas",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No se encontraron tareas programadas.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error al listar tareas programadas: ${error}`;
    }
  }
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelarTareaProgramada = tool({
  description: "Cancelar una tarea programada usando su ID",
  inputSchema: z.object({
    idTarea: z.string().describe("El ID de la tarea a cancelar")
  }),
  execute: async ({ idTarea }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(idTarea);
      return `Tarea ${idTarea} cancelada exitosamente.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error al cancelar tarea ${idTarea}: ${error}`;
    }
  }
});

/**
 * Search for kosher PRODUCTS (galletas, chocolates, lácteos, etc.)
 * Hardcoded filter to productos/ folder
 */
const buscarProductosKosher = tool({
  description: `Buscar PRODUCTOS kosher (alimentos). Usa esta herramienta cuando:
- El usuario pregunta por un producto o marca específica
- El usuario pregunta por una categoría de alimentos (galletas, chocolates, yogurt, etc.)
- Quieres verificar si un producto está en la lista kosher`,
  inputSchema: z.object({
    consulta: z
      .string()
      .describe("Nombre del producto, marca o categoría a buscar")
  }),
  execute: async ({ consulta }) => {
    const { agent } = getCurrentAgent<Chat>();

    console.log(`[buscarProductosKosher] Consulta: "${consulta}"`);

    try {
      const { data, usedIndex } = await searchWithFallback(
        agent!.getEnv().AI,
        consulta,
        "Chile Kosher/productos/",
        10
      );

      console.log(`[buscarProductosKosher] Resultados: ${data?.length || 0} (index: ${usedIndex})`);

      if (data && data.length > 0) {
        // Log chunk details for debugging
        for (const item of data) {
          console.log(`[buscarProductosKosher] File: ${item.filename}, chunks: ${item.content.length}, sizes: [${item.content.map(c => c.text.length).join(', ')}]`);
          // Log first 200 chars of each chunk to see what AutoRAG is returning
          item.content.forEach((c, i) => {
            console.log(`[buscarProductosKosher] Chunk ${i}: ${c.text.substring(0, 200).replace(/\n/g, ' ')}`);
          });
        }

        const result = data
          .map((item) => {
            const text = item.content.map((c) => c.text).join("\n");
            return `[${item.filename}]\n${text}`;
          })
          .join("\n\n---\n\n");

        console.log(`[buscarProductosKosher] Result length: ${result.length} chars`);
        return result;
      }
      return "No se encontraron productos para: " + consulta;
    } catch (e) {
      console.error("Error buscando productos:", e);
      return "Error al buscar productos";
    }
  }
});

/**
 * Search for kosher PLACES (restaurants, stores, establishments)
 * Hardcoded filter to lugares/ folder
 */
const buscarLugaresKosher = tool({
  description: `Buscar LUGARES kosher (restaurantes, tiendas, establecimientos). Usa esta herramienta cuando:
- El usuario pregunta por restaurantes kosher
- El usuario pregunta dónde comer o comprar
- El usuario busca tiendas o establecimientos kosher`,
  inputSchema: z.object({
    consulta: z
      .string()
      .describe("Tipo de lugar o nombre específico a buscar (ej: 'restaurantes', 'tiendas', nombre del local)")
  }),
  execute: async ({ consulta }) => {
    const { agent } = getCurrentAgent<Chat>();

    console.log(`[buscarLugaresKosher] Consulta: "${consulta}"`);

    try {
      const { data, usedIndex } = await searchWithFallback(
        agent!.getEnv().AI,
        consulta,
        "Chile Kosher/lugares/",
        10
      );

      console.log(`[buscarLugaresKosher] Resultados: ${data?.length || 0} (index: ${usedIndex})`);

      if (data && data.length > 0) {
        const result = data
          .map((item) => {
            const text = item.content.map((c) => c.text).join("\n");
            return `[${item.filename}]\n${text}`;
          })
          .join("\n\n---\n\n");

        return result;
      }
      return "No se encontraron lugares para: " + consulta;
    } catch (e) {
      console.error("Error buscando lugares:", e);
      return "Error al buscar lugares";
    }
  }
});

/**
 * Search for kosher certification symbols/logos (DISABLED)
 * Used when analyzing images to identify certification marks
 */
// @ts-expect-error Disabled tool kept for reference
const _buscarCertificacionKosher = tool({
  description: `Verificar si un símbolo/logo de certificación kosher es reconocido.
Usa esta herramienta cuando:
- El usuario envía una imagen de un LOGO o SÍMBOLO de certificación
- El usuario envía una imagen de un PRODUCTO que tiene un símbolo kosher visible
- Quieres verificar si una agencia certificadora es reconocida (OU, OK, Star-K, VAAD, etc.)
- El usuario pregunta por una certificación específica`,
  inputSchema: z.object({
    descripcionLogo: z
      .string()
      .describe(
        "Descripción del símbolo o logo visto en la imagen, o nombre de la certificación (ej: 'círculo con U adentro', 'OU', 'Star-K')"
      )
  }),
  execute: async ({ descripcionLogo }) => {
    const { agent } = getCurrentAgent<Chat>();

    console.log(`[buscarCertificacionKosher] Consulta: "${descripcionLogo}"`);
    console.log(`[buscarCertificacionKosher] Filtrando a carpeta: Chile Kosher/info/`);

    try {
      const searchResults = await agent!.getEnv().AI.autorag(
        "chile-kosher-search-v2"
      ).search({
        query: descripcionLogo,
        max_num_results: 5,
        filters: {
          type: "eq",
          key: "folder",
          value: "Chile Kosher/info/"
        }
      });

      console.log(`[buscarCertificacionKosher] Resultados: ${searchResults.data?.length || 0}`);

      if (searchResults.data && searchResults.data.length > 0) {
        const result = searchResults.data
          .map((item: { filename: string; content: { text: string }[] }) => {
            const text = item.content.map((c) => c.text).join("\n");
            return `[${item.filename}]\n${text}`;
          })
          .join("\n\n---\n\n");

        return result;
      }
      return "No se encontró información sobre esta certificación: " + descripcionLogo;
    } catch (e) {
      console.error("Error buscando certificación:", e);
      return "Error al buscar certificación";
    }
  }
});

/**
 * Export all available tools
 */
export const tools = {
  obtenerClima,
  obtenerHoraLocal,
  programarTarea,
  obtenerTareasProgramadas,
  cancelarTareaProgramada,
  buscarProductosKosher,
  buscarLugaresKosher
  // buscarCertificacionKosher - DESACTIVADA: detección de logos temporalmente removida
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 */
export const executions = {
  obtenerClima: async ({ ciudad }: { ciudad: string }) => {
    console.log(`Obteniendo clima para ${ciudad}`);
    return `El clima en ${ciudad} está soleado`;
  }
};
