import { IntentParser } from './IntentParser.js';
import { CommandRouter } from './CommandRouter.js';
import { CommandRequest, CommandResponse } from './types.js';
import pino from 'pino';

const logger = pino({ name: '@swarm/command-agent' });

export class CommandAgent {
  private intentParser: IntentParser;
  private commandRouter: CommandRouter;
  private commandHistory: Map<string, any[]> = new Map();

  constructor() {
    this.intentParser = new IntentParser();
    this.commandRouter = new CommandRouter();
  }

  async processCommand(request: CommandRequest): Promise<CommandResponse> {
    const { command, userId = 'anonymous', sessionId = 'default', context } = request;
    
    logger.info({ 
      command: command.slice(0, 100), 
      userId, 
      sessionId 
    }, 'Processing command');

    try {
      // Add command to history
      this.addToHistory(sessionId, { command, timestamp: new Date().toISOString() });

      // Parse the natural language command
      const parsedCommand = await this.intentParser.parseCommand(command, {
        ...context,
        history: this.getRecentHistory(sessionId)
      });

      // Log parsed intent
      logger.info({
        intent: parsedCommand.intent,
        confidence: parsedCommand.confidence,
        needsConfirmation: parsedCommand.needsConfirmation
      }, 'Command parsed');

      // Check if we need user confirmation
      if (parsedCommand.needsConfirmation && !context?.confirmed) {
        return {
          success: true,
          message: this.generateConfirmationMessage(parsedCommand),
          data: { 
            requiresConfirmation: true,
            parsedCommand: {
              intent: parsedCommand.intent,
              entities: parsedCommand.entities,
              confidence: parsedCommand.confidence
            }
          },
          followUp: 'Reply with "yes" to confirm or "no" to cancel.'
        };
      }

      // Route the command to appropriate handler
      const response = await this.commandRouter.routeCommand(parsedCommand);

      // Add response to history
      this.addToHistory(sessionId, { 
        command, 
        response: response.message, 
        success: response.success,
        timestamp: new Date().toISOString() 
      });

      return response;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error({ error: errorMessage, command }, 'Command processing failed');

      return {
        success: false,
        message: 'I encountered an error processing your request. Please try again or rephrase your command.',
        data: { error: errorMessage }
      };
    }
  }

  private generateConfirmationMessage(parsedCommand: any): string {
    const { intent, entities } = parsedCommand;
    
    switch (intent) {
      case 'BUY':
        const buyAmount = entities.amount ? `$${entities.amount}` : `${entities.quantity || 1} shares`;
        return `Confirm: Buy ${buyAmount} of ${entities.symbol}?`;
      
      case 'SELL':
        const sellAmount = entities.amount ? `$${entities.amount} worth` : `${entities.quantity || 'all'} shares`;
        return `Confirm: Sell ${sellAmount} of ${entities.symbol}?`;
      
      default:
        return `Confirm: Execute ${intent.toLowerCase()} command?`;
    }
  }

  private addToHistory(sessionId: string, entry: any): void {
    if (!this.commandHistory.has(sessionId)) {
      this.commandHistory.set(sessionId, []);
    }
    
    const history = this.commandHistory.get(sessionId)!;
    history.push(entry);
    
    // Keep only last 10 commands per session
    if (history.length > 10) {
      history.shift();
    }
  }

  private getRecentHistory(sessionId: string): any[] {
    return this.commandHistory.get(sessionId)?.slice(-3) || [];
  }

  // Tool registration for MCP
  getTools() {
    return [
      {
        name: 'command-agent.process',
        description: 'Process a natural language trading command',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Natural language command' },
            userId: { type: 'string', description: 'User identifier' },
            sessionId: { type: 'string', description: 'Session identifier' },
            context: { type: 'object', description: 'Additional context' }
          },
          required: ['command']
        }
      }
    ];
  }

  async handleToolCall(toolName: string, input: any): Promise<any> {
    switch (toolName) {
      case 'command-agent.process':
        return await this.processCommand(CommandRequest.parse(input));
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}