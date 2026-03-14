import { z } from "zod";
export { z };

const DmPolicySchema = z.enum(["open", "pairing", "allowlist"]);
const GenericConnectionModeSchema = z.enum(["websocket", "webhook"]);
const GenericTranscriptionConfigSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    provider: z.literal("faster-whisper").optional().default("faster-whisper"),
    applyToVoice: z.boolean().optional().default(true),
    applyToAudio: z.boolean().optional().default(true),
    pythonPath: z.string().optional(),
    model: z.string().optional().default("tiny"),
    language: z.string().optional(),
    device: z.string().optional().default("cpu"),
    computeType: z.string().optional().default("int8"),
    timeoutMs: z.number().int().positive().optional().default(120000),
  })
  .strict();

export const GenericChannelConfigSchema = z
  .object({
    enabled: z.boolean().optional().default(false),

    // Connection mode
    connectionMode: GenericConnectionModeSchema.optional().default("websocket"),

    // WebSocket configuration
    wsPort: z.number().int().positive().optional().default(8080),
    wsPath: z.string().optional().default("/ws"),

    // Webhook configuration
    webhookPath: z.string().optional().default("/generic/events"),
    webhookPort: z.number().int().positive().optional().default(3000),
    webhookSecret: z.string().optional(),

    // Message policy
    dmPolicy: DmPolicySchema.optional().default("open"),
    allowFrom: z.array(z.string()).optional(),

    // Message limits
    historyLimit: z.number().int().min(0).optional().default(10),
    textChunkLimit: z.number().int().min(1).optional().default(4000),

    // Media handling
    mediaMaxMb: z.number().positive().optional().default(30),
    transcription: GenericTranscriptionConfigSchema.optional(),
  })
  .strict();
