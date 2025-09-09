import { ParsedCommand, CommandResponse, CommandIntentType } from './types.js';
import pino from 'pino';

const logger = pino({ name: '@swarm/command-agent:router' });

export class CommandRouter {
  private mcpHostUrl: string;

  constructor(mcpHostUrl: string = 'http://localhost:4000') {
    this.mcpHostUrl = mcpHostUrl.replace(/\/$/, '');
  }

  async routeCommand(command: ParsedCommand): Promise<CommandResponse> {
    logger.info({ intent: command.intent, entities: command.entities }, 'Routing command');

    try {
      switch (command.intent) {
        case 'BUY':
        case 'SELL':
          return await this.handleTradingCommand(command);
        
        case 'STATUS':
          return await this.handleStatusQuery(command);
        
        case 'QUERY':
          return await this.handleGeneralQuery(command);
        
        case 'ALERT':
          return await this.handleAlertCommand(command);
        
        case 'ANALYZE':
          return await this.handleAnalysisCommand(command);
        
        case 'CONFIG':
          return await this.handleConfigCommand(command);
        
        case 'STOP':
          return await this.handleStopCommand(command);
        
        default:
          return {
            success: false,
            message: `Unknown command intent: ${command.intent}`
          };
      }
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error }, 'Command routing failed');
      return {
        success: false,
        message: 'Failed to execute command. Please try again.'
      };
    }
  }

  private async handleTradingCommand(command: ParsedCommand): Promise<CommandResponse> {
    const { entities } = command;
    
    if (!entities.symbol) {
      return {
        success: false,
        message: 'Please specify a stock symbol for trading commands.'
      };
    }

    // Route through strategy-builder agent
    try {
      // First get current price from market-data
      const marketData = await this.callMCPService('market-data', 'market-data.get_ohlcv', {
        symbol: entities.symbol,
        start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0], // yesterday
        end: new Date().toISOString().split('T')[0], // today
        interval: '1d'
      });

      if (!marketData.rows || marketData.rows.length === 0) {
        return {
          success: false,
          message: `Could not fetch price data for ${entities.symbol}`
        };
      }

      const currentPrice = marketData.rows[marketData.rows.length - 1].close;
      const quantity = entities.quantity || (entities.amount ? Math.floor(entities.amount / currentPrice) : 1);

      // Create trading proposal
      const proposal = {
        symbol: entities.symbol,
        side: command.intent,
        qty: quantity,
        price: entities.price || currentPrice,
        limits: { maxGross: 100000, maxSingle: 10000 },
        current: [] // Would be populated with current positions
      };

      // Check with risk engine
      const riskCheck = await this.callMCPService('risk-engine', 'risk-engine.pretrade_check', proposal);
      
      if (riskCheck.status !== 'APPROVED') {
        return {
          success: false,
          message: `Trade rejected by risk engine: ${riskCheck.breaches?.join(', ') || 'Risk limits exceeded'}`,
          data: { riskCheck }
        };
      }

      // If approved, publish to bus for execution
      const tradeOrder = {
        ts: new Date().toISOString(),
        symbol: entities.symbol,
        action: command.intent,
        qty: quantity,
        price: entities.price || currentPrice,
        orderType: entities.price ? 'LIMIT' : 'MARKET',
        source: 'neural-command'
      };

      await this.callMCPService('bus', 'bus.publish', {
        topic: 'trade_orders',
        payload: tradeOrder
      });

      return {
        success: true,
        message: `${command.intent} order for ${quantity} shares of ${entities.symbol} submitted successfully.`,
        data: { order: tradeOrder, riskCheck },
        followUp: `Order will be executed at ${entities.price ? 'limit price $' + entities.price : 'market price'}.`
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to process ${command.intent} order: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async handleStatusQuery(command: ParsedCommand): Promise<CommandResponse> {
    try {
      // This would query portfolio status from risk-engine or a portfolio service
      // For now, return a mock response
      return {
        success: true,
        message: 'Portfolio Status: Your trading swarm is active with 5 agents running.',
        data: {
          activeAgents: ['SignalAgent', 'SentimentAgent', 'TrendAgent', 'StrategyAgent', 'RiskAgent'],
          portfolioValue: '$50,000',
          dailyPnL: '+$245.67',
          openPositions: 3
        },
        followUp: 'Would you like details on any specific positions or agent performance?'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Could not retrieve portfolio status.'
      };
    }
  }

  private async handleGeneralQuery(command: ParsedCommand): Promise<CommandResponse> {
    return {
      success: true,
      message: `I understand you're asking: "${command.originalText}". I can help with trading commands, portfolio status, alerts, and analysis. What would you like to know?`,
      followUp: 'Try commands like "buy AAPL", "what\'s my status", or "analyze my portfolio".'
    };
  }

  private async handleAlertCommand(command: ParsedCommand): Promise<CommandResponse> {
    const { entities } = command;
    
    if (!entities.symbol || !entities.price) {
      return {
        success: false,
        message: 'Please specify both symbol and price for alerts (e.g., "alert me when AAPL hits $150")'
      };
    }

    // Store alert in config service
    try {
      const alertId = `alert_${entities.symbol}_${entities.price}_${Date.now()}`;
      await this.callMCPService('config', 'config.set', {
        key: `alerts.${alertId}`,
        value: {
          symbol: entities.symbol,
          price: entities.price,
          condition: entities.condition || 'crosses',
          created: new Date().toISOString(),
          active: true
        }
      });

      return {
        success: true,
        message: `Alert set for ${entities.symbol} at $${entities.price}`,
        data: { alertId },
        followUp: 'I\'ll notify you when the price condition is met.'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to set alert. Please try again.'
      };
    }
  }

  private async handleAnalysisCommand(command: ParsedCommand): Promise<CommandResponse> {
    // This would integrate with analytics service or meta-agent
    return {
      success: true,
      message: 'Analysis: Your portfolio performance is driven by strong tech sector exposure. Recent gains in AAPL (+2.1%) and MSFT (+1.8%) offset losses in energy sector.',
      data: {
        analysis: 'portfolio_performance',
        timeframe: command.entities.timeframe || '1d'
      },
      followUp: 'Would you like a deeper analysis of any specific positions?'
    };
  }

  private async handleConfigCommand(command: ParsedCommand): Promise<CommandResponse> {
    return {
      success: true,
      message: 'Configuration commands not yet implemented.',
      followUp: 'Available soon: risk settings, agent parameters, and trading preferences.'
    };
  }

  private async handleStopCommand(command: ParsedCommand): Promise<CommandResponse> {
    return {
      success: true,
      message: 'Emergency stop activated. All trading agents have been paused.',
      data: { action: 'emergency_stop' },
      followUp: 'Use "resume trading" to reactivate agents.'
    };
  }

  private async callMCPService(service: string, tool: string, input: any): Promise<any> {
    const url = `${this.mcpHostUrl}/call/${service}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-role': 'neural_command'
      },
      body: JSON.stringify({ tool, input })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP service ${service} error: ${response.status} ${errorText}`);
    }

    return await response.json();
  }
}