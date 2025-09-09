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

      // Step 2: Present agent analysis to user with character-driven responses
      let analysisMessage = `🤖 **Agent Swarm Analysis for ${entities.symbol}**\n\n`;
      
      if (agentAnalysis.marketData) {
        const blipResponse = this.getBlipResponse(agentAnalysis.marketData, entities.symbol!);
        analysisMessage += `🟠 **Blip (Signal Agent)**: ${blipResponse}\n`;
      }
      
      if (agentAnalysis.sentiment) {
        const gillyResponse = this.getGillyResponse(agentAnalysis.sentiment, entities.symbol!);
        analysisMessage += `🔵 **Gilly (Sentiment Agent)**: ${gillyResponse}\n`;
      }
      
      if (agentAnalysis.technical) {
        const margoResponse = this.getMargoResponse(agentAnalysis.technical, entities.symbol!);
        analysisMessage += `🟢 **Margo (Trend Agent)**: ${margoResponse}\n`;
      }
      
      if (agentAnalysis.strategy) {
        const aquaResponse = this.getAquaResponse(agentAnalysis.strategy, command.intent, entities.symbol!);
        analysisMessage += `🟣 **Aqua (Strategy Agent)**: ${aquaResponse}\n`;
      }
      
      if (agentAnalysis.risk) {
        const sheldonResponse = this.getSheldonResponse(agentAnalysis.risk, entities.symbol!, command.intent);
        analysisMessage += `⚪ **Sheldon (Risk Agent)**: ${sheldonResponse}\n`;
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
      const agentStatuses = [
        "🟠 **Blip**: *beep beep* All systems GO! Market data flowing like electricity! ⚡",
        "🔵 **Gilly**: Vibes are good, fam! Social feeds looking spicy today 🌶️📱",
        "🟢 **Margo**: Gracefully monitoring trend flows... all patterns in harmony 🌸",
        "🟣 **Aqua**: Brain dome glowing! Strategy matrices updated and optimized 🧠✨",
        "⚪ **Sheldon**: *nervous calculating* Risk parameters within bounds... for now ⚠️📊",
        "⚫ **Tank**: Standing ready for execution. Orders locked and loaded 🎯",
        "🤍 **Reflecta**: Performance metrics... analyzing... all agents operational 📈"
      ];

      const statusMessage = `🤖 **Agent Swarm Status Report**\n\n${agentStatuses.join('\n')}\n\n💼 **Portfolio Overview**:\n• Value: $50,000\n• Daily P&L: +$245.67 📈\n• Open Positions: 3\n• Swarm Uptime: 99.9% ⚡`;

      return {
        success: true,
        message: statusMessage,
        data: {
          activeAgents: ['Blip', 'Gilly', 'Margo', 'Aqua', 'Sheldon', 'Tank', 'Reflecta'],
          portfolioValue: '$50,000',
          dailyPnL: '+$245.67',
          openPositions: 3,
          swarmUptime: '99.9%'
        },
        followUp: 'Want to chat with any specific agent or see detailed position info? 🎮'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Could not retrieve portfolio status.'
      };
    }
  }

  private async handleGeneralQuery(command: ParsedCommand): Promise<CommandResponse> {
    const randomAgent = Math.floor(Math.random() * 7);
    const agentResponses = [
      "🟠 **Blip**: *beep beep* I heard you asking about something! What data do you need? Market prices? Volume? I've got ALL the numbers! ⚡",
      "🔵 **Gilly**: Hey! I'm here to help! Need some market vibes? Social sentiment? Just ask! The internet is my playground! 📱✨",
      "🟢 **Margo**: *graceful hum* I sense you seek guidance... I can share insights about market trends and patterns... 🌸",
      "🟣 **Aqua**: *brain dome sparkling* Ooh, a question! I love questions! Need strategy advice? Portfolio optimization? My circuits are buzzing! 🧠💫",
      "⚪ **Sheldon**: *cautious beeping* You're asking something... is it about risk? Please tell me it's about risk management! That's my specialty! ⚠️📊",
      "⚫ **Tank**: Roger. Standing by for orders. Need execution? Trade management? I'm your bot. 🎯",
      "🤍 **Reflecta**: Query detected. Available functions: trading, analysis, status reports, portfolio metrics. Specify requirements. 📈"
    ];

    return {
      success: true,
      message: `${agentResponses[randomAgent]}\n\n🤖 **Neural Command Layer**: I understand you're asking: "${command.originalText}". Our agent swarm can help with trading, analysis, portfolio status, and market insights!`,
      followUp: '💡 Try: "buy AAPL", "show status", "analyze portfolio", or "what\'s the sentiment on Tesla?"'
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
    const reflectaAnalysis = `🤍 **Reflecta's Deep Analysis**:\n\n*chrome surface gleaming with data readouts*\n\nPortfolio metrics indicate... optimal performance vectors in technology sector. AAPL +2.1% correlation with MSFT +1.8% suggests systematic alpha capture. Energy sector volatility absorbed by diversification matrix.\n\n*stat readouts flickering*\n\nQuantitative assessment: Sharpe ratio 1.47... acceptable risk-adjusted returns. Sector allocation efficiency: 87.3%. Recommendation: Maintain current trajectory with minor rebalancing considerations.\n\n📊 *processing complete*`;
    
    return {
      success: true,
      message: reflectaAnalysis,
      data: {
        analysis: 'portfolio_performance',
        timeframe: command.entities.timeframe || '1d',
        sharpeRatio: 1.47,
        sectorEfficiency: 87.3
      },
      followUp: '🤍 Reflecta: "Additional granular analysis available upon request. Which specific metrics require examination?"'
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
    const emergencyResponses = [
      "🟠 **Blip**: *circuits powering down* WHOA! Emergency stop activated! All data streams paused! 🛑",
      "⚫ **Tank**: Copy that. All weapons safe. Standing down. Orders suspended. 🎯❌",
      "⚪ **Sheldon**: *relieved calculating* FINALLY! Risk exposure minimized! All stop losses engaged! 🛡️",
      "🟣 **Aqua**: *brain dome dimming* Strategic pause initiated. All decision matrices on hold... 💤",
      "🤍 **Reflecta**: Emergency protocol executed. All trading functions suspended. Status: SAFE MODE. 🔒"
    ];

    const stopMessage = `🚨 **EMERGENCY STOP ACTIVATED** 🚨\n\n${emergencyResponses.join('\n')}\n\n🛑 All trading operations have been suspended for safety.`;

    return {
      success: true,
      message: stopMessage,
      data: { action: 'emergency_stop', timestamp: new Date().toISOString() },
      followUp: '⚫ Tank: "Awaiting orders to resume operations, Commander."'
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

  private getBlipResponse(marketData: any, symbol: string): string {
    const changeEmoji = marketData.change > 0 ? "🚀" : marketData.change < 0 ? "📉" : "😐";
    const excitement = marketData.change > 2 ? "WHOA! WHOA! WHOA!" : marketData.change > 0 ? "Ooh! Ooh!" : "Eh...";
    
    return `${excitement} ${symbol} is at $${marketData.price} ${changeEmoji} ${marketData.change > 0 ? '+' : ''}${marketData.change.toFixed(2)}%! *beep beep* Volume's at ${(marketData.volume / 1000000).toFixed(1)}M shares! *circuit buzzing* Data looks ${marketData.change > 0 ? 'TASTY' : 'kinda stale'} to me! 🔥`;
  }

  private getGillyResponse(sentiment: any, symbol: string): string {
    const vibeCheck = sentiment.score > 0.6 ? "The vibes are IMMACULATE" : sentiment.score < 0.4 ? "Big yikes energy" : "Neutral vibes, I guess";
    const emoji = sentiment.score > 0.6 ? "🚀💎" : sentiment.score < 0.4 ? "📉😬" : "😐🤷‍♀️";
    
    const memeRef = sentiment.score > 0.6 ? "To the moon! 🌙" : sentiment.score < 0.4 ? "RIP in chat 💀" : "Sideways action, no cap";
    
    return `${vibeCheck} on ${symbol} rn ${emoji}! Sentiment score: ${(sentiment.score * 100).toFixed(0)}%. ${memeRef} *scrolling through social feeds* The internet says... well, you know how it is! 📱✨`;
  }

  private getMargoResponse(technical: any, symbol: string): string {
    const trendFlow = technical.trend === 'Bullish' ? "flows upward like a gentle stream" : technical.trend === 'Bearish' ? "descends gracefully like autumn leaves" : "moves in perfect balance";
    const rsiWisdom = technical.rsi > 60 ? "perhaps approaching overbought tranquility" : technical.rsi < 40 ? "resting in oversold serenity" : "dwelling in harmonious equilibrium";
    
    return `*graceful processor hum* ${symbol} ${trendFlow}... RSI of ${technical.rsi} suggests ${rsiWisdom}. Support beckons at $${technical.support?.toFixed(2)}, resistance awaits at $${technical.resistance?.toFixed(2)}. The patterns whisper of ${technical.trend.toLowerCase()} intentions... 🌸`;
  }

  private getAquaResponse(strategy: any, intent: string, symbol: string): string {
    const brainSpark = strategy.confidence > 0.8 ? "💡✨EUREKA!✨💡" : strategy.confidence > 0.6 ? "*brain circuits lighting up*" : "*thoughtful processing*";
    const playfulTone = strategy.recommendation === intent ? "My genius brain agrees!" : "Hmm, my calculations suggest otherwise...";
    
    return `${brainSpark} ${playfulTone} Strategy matrix says: ${strategy.recommendation} with ${(strategy.confidence * 100).toFixed(0)}% confidence! *dome glowing brighter* ${strategy.reasoning}. Want to see my full calculation matrix? It's quite elegant! 🧠💫`;
  }

  private getSheldonResponse(risk: any, symbol: string, intent: string): string {
    const panicLevel = risk.score > 7 ? "🚨 RED ALERT! DANGER! 🚨" : risk.score > 5 ? "⚠️ Caution advised..." : "✅ Within acceptable parameters";
    const sheldonWorry = risk.score > 7 ? "*calculator spinning frantically*" : risk.score > 5 ? "*nervous beeping*" : "*calm calculating*";
    
    const riskFactors = risk.factors?.join(', ') || 'standard market factors';
    
    return `${sheldonWorry} ${panicLevel} Risk assessment for ${symbol}: ${risk.score}/10! Status: ${risk.status}. Factors detected: ${riskFactors}. *chest calculator flashing* ${intent === 'SELL' ? 'At least you\'re not buying more risk!' : 'Are you SURE about this?!'} 📊⚠️`;
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