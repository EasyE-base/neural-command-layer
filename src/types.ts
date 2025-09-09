import { z } from 'zod';

// Command Intent Types
export const CommandIntentType = z.enum([
  'BUY',
  'SELL',
  'QUERY',
  'ALERT', 
  'ANALYZE',
  'CONFIG',
  'STOP',
  'STATUS'
]);

export type CommandIntentType = z.infer<typeof CommandIntentType>;

// Entity Extraction Schema
export const ExtractedEntities = z.object({
  symbol: z.string().optional(),
  amount: z.number().optional(),
  price: z.number().optional(),
  quantity: z.number().optional(),
  timeframe: z.string().optional(),
  condition: z.string().optional()
});

export type ExtractedEntities = z.infer<typeof ExtractedEntities>;

// Parsed Command Schema
export const ParsedCommand = z.object({
  intent: CommandIntentType,
  entities: ExtractedEntities,
  originalText: z.string(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean().default(false)
});

export type ParsedCommand = z.infer<typeof ParsedCommand>;

// Command Response Schema
export const CommandResponse = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.any().optional(),
  followUp: z.string().optional()
});

export type CommandResponse = z.infer<typeof CommandResponse>;

// Command Request Schema
export const CommandRequest = z.object({
  command: z.string(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  context: z.record(z.any()).optional()
});

export type CommandRequest = z.infer<typeof CommandRequest>;