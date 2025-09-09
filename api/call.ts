import { VercelRequest, VercelResponse } from '@vercel/node';
import { CommandAgent } from '../src/CommandAgent.js';

const agent = new CommandAgent();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-agent-role, x-agent-id, x-correlation-id, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { tool, input } = req.body;

      // Handle MCP tool calls
      if (tool && typeof tool === 'string') {
        const result = await agent.handleToolCall(tool, input);
        res.status(200).json(result);
        return;
      }

      // Fallback to direct command processing
      const result = await agent.processCommand(req.body);
      res.status(200).json(result);
      return;
    } catch (error: any) {
      res.status(500).json({ 
        error: 'internal_error', 
        message: error.message 
      });
      return;
    }
  }

  res.status(405).json({ error: 'method_not_allowed' });
}