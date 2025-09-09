import Anthropic from '@anthropic-ai/sdk';
import { ParsedCommand, CommandIntentType, ExtractedEntities } from './types.js';
import pino from 'pino';

const logger = pino({ name: '@swarm/command-agent:intent-parser' });

export class IntentParser {
  private anthropic: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    this.anthropic = new Anthropic({ apiKey });
  }

  async parseCommand(command: string, context?: Record<string, any>): Promise<ParsedCommand> {
    const contextStr = context ? `\nContext: ${JSON.stringify(context)}` : '';
    
    const prompt = `You are a trading command parser. Parse this natural language trading command and return a JSON object with the following structure:

{
  "intent": "BUY" | "SELL" | "QUERY" | "ALERT" | "ANALYZE" | "CONFIG" | "STOP" | "STATUS",
  "entities": {
    "symbol": "string (optional)",
    "amount": "number in USD (optional)", 
    "price": "number (optional)",
    "quantity": "number of shares (optional)",
    "timeframe": "string like '1d', '1w', '1m' (optional)",
    "condition": "string describing conditions (optional)"
  },
  "confidence": "number between 0 and 1",
  "needsConfirmation": "boolean - true for high-impact trades"
}

Examples:
- "Buy $5000 of AAPL" → {"intent": "BUY", "entities": {"symbol": "AAPL", "amount": 5000}, "confidence": 0.95, "needsConfirmation": true}
- "What's my portfolio status?" → {"intent": "STATUS", "entities": {}, "confidence": 0.9, "needsConfirmation": false}
- "Set alert for TSLA at $200" → {"intent": "ALERT", "entities": {"symbol": "TSLA", "price": 200}, "confidence": 0.9, "needsConfirmation": false}
- "Why did my portfolio drop today?" → {"intent": "ANALYZE", "entities": {"timeframe": "1d"}, "confidence": 0.85, "needsConfirmation": false}

Command: "${command}"${contextStr}

Return only valid JSON:`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response from Claude');
      }

      // Extract JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const parsedJson = JSON.parse(jsonMatch[0]);
      
      // Validate and return
      const result = {
        ...parsedJson,
        originalText: command
      };

      const validatedCommand = ParsedCommand.parse(result);
      
      logger.info({ 
        command, 
        intent: validatedCommand.intent,
        confidence: validatedCommand.confidence 
      }, 'Command parsed successfully');

      return validatedCommand;
      
    } catch (error) {
      logger.error({ command, error: error instanceof Error ? error.message : error }, 'Failed to parse command');
      
      // Fallback parsing for common patterns
      return this.fallbackParse(command);
    }
  }

  private fallbackParse(command: string): ParsedCommand {
    const lowerCommand = command.toLowerCase();
    
    // Simple pattern matching fallbacks
    if (lowerCommand.includes('buy') || lowerCommand.includes('purchase')) {
      const symbolMatch = command.match(/\b([A-Z]{1,5})\b/);
      const amountMatch = command.match(/\$([0-9,]+)/);
      
      return {
        intent: 'BUY' as CommandIntentType,
        entities: {
          symbol: symbolMatch?.[1],
          amount: amountMatch ? parseInt(amountMatch[1].replace(',', '')) : undefined
        },
        originalText: command,
        confidence: 0.6,
        needsConfirmation: true
      };
    }

    if (lowerCommand.includes('sell')) {
      const symbolMatch = command.match(/\b([A-Z]{1,5})\b/);
      return {
        intent: 'SELL' as CommandIntentType,
        entities: { symbol: symbolMatch?.[1] },
        originalText: command,
        confidence: 0.6,
        needsConfirmation: true
      };
    }

    if (lowerCommand.includes('status') || lowerCommand.includes('portfolio')) {
      return {
        intent: 'STATUS' as CommandIntentType,
        entities: {},
        originalText: command,
        confidence: 0.7,
        needsConfirmation: false
      };
    }

    // Default to QUERY for unrecognized commands
    return {
      intent: 'QUERY' as CommandIntentType,
      entities: {},
      originalText: command,
      confidence: 0.3,
      needsConfirmation: false
    };
  }
}