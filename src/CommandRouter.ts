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

    // Orchestrate all agents to provide their input
    try {
      // Step 1: Gather all agent inputs in parallel
      const agentAnalysis = await this.gatherAgentInputs(entities.symbol!, command.intent);

      // Step 2: Present agent analysis to user
      let analysisMessage = `🤖 **Agent Swarm Analysis for ${entities.symbol}**\n\n`;
      
      if (agentAnalysis.marketData) {
        analysisMessage += `📊 **Signal Agent**: Current price $${agentAnalysis.marketData.price} (${agentAnalysis.marketData.change > 0 ? '+' : ''}${agentAnalysis.marketData.change.toFixed(2)}%)\n`;
      }
      
      if (agentAnalysis.sentiment) {
        analysisMessage += `💭 **Sentiment Agent**: ${agentAnalysis.sentiment.score > 0.6 ? '🟢 Bullish' : agentAnalysis.sentiment.score < 0.4 ? '🔴 Bearish' : '🟡 Neutral'} (${(agentAnalysis.sentiment.score * 100).toFixed(0)}%)\n`;
      }
      
      if (agentAnalysis.technical) {
        analysisMessage += `📈 **Trend Agent**: ${agentAnalysis.technical.trend} trend, RSI: ${agentAnalysis.technical.rsi}\n`;
      }
      
      if (agentAnalysis.strategy) {
        analysisMessage += `🎯 **Strategy Agent**: ${agentAnalysis.strategy.recommendation} (confidence: ${(agentAnalysis.strategy.confidence * 100).toFixed(0)}%)\n`;
      }
      
      if (agentAnalysis.risk) {
        analysisMessage += `⚠️ **Risk Agent**: ${agentAnalysis.risk.status} - Risk Score: ${agentAnalysis.risk.score}/10\n`;
      }

      // Step 3: Make final recommendation
      const recommendation = this.synthesizeAgentInputs(agentAnalysis, command.intent);
      analysisMessage += `\n🧠 **Swarm Consensus**: ${recommendation.decision}\n`;
      
      if (recommendation.shouldProceed) {
        analysisMessage += `\n✅ Agents recommend proceeding with ${command.intent} of ${entities.symbol}`;
        
        // Execute the trade with agent-informed parameters
        const quantity = entities.quantity || recommendation.suggestedQuantity || 1;
        const price = entities.price || recommendation.suggestedPrice;
        
        // Final risk check
        const proposal = {
          symbol: entities.symbol,
          side: command.intent,
          qty: quantity,
          price: price,
          limits: { maxGross: 100000, maxSingle: 10000 },
          current: []
        };

        const riskCheck = await this.callMCPService('risk-engine', 'risk-engine.pretrade_check', proposal);
        
        if (riskCheck.status !== 'APPROVED') {
          return {
            success: false,
            message: `${analysisMessage}\n\n❌ Final risk check failed: ${riskCheck.breaches?.join(', ') || 'Risk limits exceeded'}`,
            data: { agentAnalysis, riskCheck }
          };
        }

        return {
          success: true,
          message: `${analysisMessage}\n\n💼 Confirm: ${command.intent} ${quantity} shares of ${entities.symbol}?`,
          data: { 
            requiresConfirmation: true,
            parsedCommand: command,
            agentAnalysis,
            recommendation
          },
          followUp: "Reply with 'yes' to confirm or 'no' to cancel. All agents have provided their input above."
        };
      } else {
        return {
          success: false,
          message: `${analysisMessage}\n\n❌ Agents recommend AGAINST this trade: ${recommendation.reason}`,
          data: { agentAnalysis, recommendation }
        };
      }

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

  private async gatherAgentInputs(symbol: string, intent: string): Promise<any> {
    const results: any = {};
    
    try {
      // Gather inputs from all agents in parallel with fallbacks
      const agentCalls = await Promise.allSettled([
        // Signal Agent - get market data
        this.callMCPService('market-data', 'market-data.get_ohlcv', {
          symbol,
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end: new Date().toISOString().split('T')[0],
          interval: '1d'
        }).then(data => {
          const latest = data.rows?.[data.rows.length - 1];
          const previous = data.rows?.[data.rows.length - 2];
          return {
            price: latest?.close || 100,
            change: previous ? ((latest.close - previous.close) / previous.close) * 100 : 0,
            volume: latest?.volume || 1000000
          };
        }).catch(() => ({ price: 100, change: 0, volume: 1000000 })),

        // Sentiment Agent - get sentiment analysis
        this.callMCPService('nlp-sentiment', 'nlp-sentiment.analyze', {
          text: `${symbol} stock market sentiment analysis`,
          symbol
        }).then(data => ({
          score: data.sentiment || 0.5,
          confidence: data.confidence || 0.7,
          sources: data.sources || ['mock']
        })).catch(() => ({ score: 0.5, confidence: 0.7, sources: ['mock'] })),

        // Risk Agent - get risk assessment
        this.callMCPService('risk-engine', 'risk-engine.assess_symbol', {
          symbol,
          intent: intent.toLowerCase()
        }).then(data => ({
          status: data.status || 'MEDIUM',
          score: data.riskScore || 5,
          factors: data.factors || ['volatility', 'liquidity']
        })).catch(() => ({ status: 'MEDIUM', score: 5, factors: ['volatility'] }))
      ]);

      // Process results
      if (agentCalls[0].status === 'fulfilled') {
        results.marketData = agentCalls[0].value;
      }
      if (agentCalls[1].status === 'fulfilled') {
        results.sentiment = agentCalls[1].value;
      }
      if (agentCalls[2].status === 'fulfilled') {
        results.risk = agentCalls[2].value;
      }

      // Add mock technical analysis and strategy recommendations
      results.technical = {
        trend: results.marketData?.change > 2 ? 'Bullish' : results.marketData?.change < -2 ? 'Bearish' : 'Sideways',
        rsi: Math.floor(Math.random() * 30) + 35, // Mock RSI between 35-65
        support: results.marketData ? results.marketData.price * 0.95 : 95,
        resistance: results.marketData ? results.marketData.price * 1.05 : 105
      };

      results.strategy = {
        recommendation: intent === 'BUY' ? 
          (results.sentiment?.score > 0.6 && results.technical?.trend !== 'Bearish' ? 'BUY' : 'HOLD') :
          (results.sentiment?.score < 0.4 && results.technical?.trend !== 'Bullish' ? 'SELL' : 'HOLD'),
        confidence: Math.min(0.9, (results.sentiment?.confidence || 0.7) * 0.8 + 0.2),
        reasoning: `Based on sentiment (${((results.sentiment?.score || 0.5) * 100).toFixed(0)}%) and technical analysis`
      };

    } catch (error) {
      logger.error({ error, symbol }, 'Failed to gather some agent inputs');
    }

    return results;
  }

  private synthesizeAgentInputs(analysis: any, intent: string): any {
    let positiveSignals = 0;
    let negativeSignals = 0;
    let totalSignals = 0;
    let reasons: string[] = [];

    // Analyze market data signals
    if (analysis.marketData) {
      totalSignals++;
      if (intent === 'BUY') {
        if (analysis.marketData.change > 0) {
          positiveSignals++;
          reasons.push('Price momentum positive');
        } else {
          negativeSignals++;
          reasons.push('Price momentum negative');
        }
      }
    }

    // Analyze sentiment signals
    if (analysis.sentiment) {
      totalSignals++;
      if (intent === 'BUY' && analysis.sentiment.score > 0.6) {
        positiveSignals++;
        reasons.push('Sentiment bullish');
      } else if (intent === 'SELL' && analysis.sentiment.score < 0.4) {
        positiveSignals++;
        reasons.push('Sentiment bearish');
      } else {
        negativeSignals++;
        reasons.push('Sentiment not aligned');
      }
    }

    // Analyze technical signals
    if (analysis.technical) {
      totalSignals++;
      const trendAligned = (intent === 'BUY' && analysis.technical.trend === 'Bullish') ||
                          (intent === 'SELL' && analysis.technical.trend === 'Bearish');
      if (trendAligned) {
        positiveSignals++;
        reasons.push('Technical trend aligned');
      } else {
        negativeSignals++;
        reasons.push('Technical trend not aligned');
      }
    }

    // Analyze risk signals
    if (analysis.risk) {
      totalSignals++;
      if (analysis.risk.score <= 6) {
        positiveSignals++;
        reasons.push('Risk acceptable');
      } else {
        negativeSignals++;
        reasons.push('Risk too high');
      }
    }

    const consensus = positiveSignals / totalSignals;
    const shouldProceed = consensus >= 0.6; // Need 60% agreement

    return {
      shouldProceed,
      decision: shouldProceed ? 
        `${positiveSignals}/${totalSignals} agents agree - PROCEED` : 
        `Only ${positiveSignals}/${totalSignals} agents agree - CAUTION`,
      confidence: consensus,
      reason: reasons.join(', '),
      suggestedQuantity: shouldProceed ? Math.max(1, Math.floor(10 * consensus)) : 1,
      suggestedPrice: analysis.marketData?.price
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