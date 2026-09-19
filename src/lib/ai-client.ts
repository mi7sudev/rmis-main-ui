// ============================================================================
// ai-client.ts — OpenAI-compatible AI client (drop-in replacement for
//                z-ai-web-dev-sdk's ZAI class).
//
// WHY THIS EXISTS:
//   The app originally used `z-ai-web-dev-sdk` which talked to Z.ai's internal
//   API (configured via /etc/.z-ai-config). We've swapped to NVIDIA's
//   OpenAI-compatible API (https://integrate.api.nvidia.com/v1) so the same
//   code runs on localhost AND the intranet server with credentials in `.env`.
//
// DROP-IN CONTRACT:
//   This module exports a `ZAI` class with the SAME shape the extraction code
//   expects from z-ai-web-dev-sdk:
//     const zai = await ZAI.create();
//     await zai.chat.completions.create({ messages: [...] });          // text
//     await zai.chat.completions.createVision({ messages: [...] });    // image
//   Both return `{ choices: [{ message: { content: string } }] }`.
//
// NVIDIA API NOTES:
//   • Text path (Excel/PDF/Word → JSON): one call to /chat/completions with
//     AI_TEXT_MODEL (a chat/instruct model that can emit JSON).
//   • Vision path (image → JSON): TWO calls —
//       1. OCR the image with AI_VISION_MODEL (nemotron-nano-ocr-v2) → raw text
//       2. Structure the OCR text with AI_TEXT_MODEL → JSON
//     This 2-step pipeline is needed because nemotron-ocr-v2 is an OCR model
//     (image → text), not a structuring model (text → JSON).
//
// All config comes from @/lib/env (AI_API_KEY, AI_BASE_URL, AI_*_MODEL).
// ============================================================================

import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Types — match the shape z-ai-web-dev-sdk exposed so extraction.ts is
// unchanged. Only the import path differs.
// ---------------------------------------------------------------------------
export type ChatRole = "system" | "user" | "assistant";

export type VisionContentItem = {
  type: "text" | "image_url" | "video_url" | "file_url";
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  file_url?: { url: string };
};

export type ChatMessage = {
  role: ChatRole;
  content: string | VisionContentItem[];
};

export type ChatCompletionResponse = {
  choices: Array<{ message?: { content?: string } } | undefined>;
};

type CreateOptions = {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  thinking?: { type: "enabled" | "disabled" };
  [k: string]: unknown;
};

// ---------------------------------------------------------------------------
// HTTP helper — POST JSON to the OpenAI-compatible /chat/completions endpoint.
// Throws a clear Error on non-2xx so the extract route's try/catch can surface
// the message to the applicant.
// ---------------------------------------------------------------------------
async function postChatCompletion(
  body: Record<string, unknown>
): Promise<ChatCompletionResponse> {
  if (!env.AI_API_KEY) {
    throw new Error(
      "AI_API_KEY is not set. Document Intelligence cannot run. " +
        "Add AI_API_KEY to your .env file (see .env.example)."
    );
  }

  const url = `${env.AI_BASE_URL}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.AI_API_KEY}`,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `AI API request failed (HTTP ${res.status}) at ${url}: ${errText.slice(0, 500)}`
    );
  }

  return (await res.json()) as ChatCompletionResponse;
}

// ---------------------------------------------------------------------------
// ChatCompletions — implements `create` (text) and `createVision` (image).
// ---------------------------------------------------------------------------
class ChatCompletions {
  /**
   * Text completion — sends the prompt + (already-extracted) document text to
   * AI_TEXT_MODEL and returns the JSON-shaped response. Used for Excel, PDF,
   * and Word documents where the text has been pre-extracted by exceljs/unpdf/
   * mammoth.
   */
  async create(opts: CreateOptions): Promise<ChatCompletionResponse> {
    // Strip z-ai-specific fields the caller may pass through (e.g. `thinking`)
    // — NVIDIA's API ignores unknown fields but we keep the payload clean.
    const { thinking, ...rest } = opts;
    void thinking;
    return postChatCompletion({
      ...rest,
      model: rest.model || env.AI_TEXT_MODEL,
    });
  }

  /**
   * Vision completion — sends the image + prompt directly to AI_VISION_MODEL
   * (a vision-language model like nvidia/nemotron-nano-12b-v2-vl) which can
   * both read the image AND emit structured JSON in a single API call.
   *
   * The caller (extraction.ts) builds a multimodal `content` array with a text
   * prompt + an image_url — we forward it as-is to the vision model.
   */
  async createVision(opts: CreateOptions): Promise<ChatCompletionResponse> {
    const { thinking, ...rest } = opts;
    void thinking;
    return postChatCompletion({
      ...rest,
      model: rest.model || env.AI_VISION_MODEL,
    });
  }
}

class Chat {
  completions: ChatCompletions;
  constructor() {
    this.completions = new ChatCompletions();
  }
}

// ---------------------------------------------------------------------------
// ZAI — top-level class. `ZAI.create()` is the async factory the extraction
// code calls; it returns a ready-to-use instance. Kept async to match the
// original SDK's signature (which did config-file loading).
// ---------------------------------------------------------------------------
export class ZAI {
  chat: Chat;
  private constructor() {
    this.chat = new Chat();
  }
  static async create(): Promise<ZAI> {
    // Validate that the AI key is configured before returning the client.
    // The actual error is deferred to the first API call (above), but logging
    // here gives earlier visibility during development.
    if (!env.AI_API_KEY) {
      console.warn(
        "[ai-client] AI_API_KEY is not set — Document Intelligence calls will fail."
      );
    }
    return new ZAI();
  }
}
