import { VercelRequest, VercelResponse } from '@vercel/node';
import { CommandAgent } from '../src/CommandAgent.js';

const agent = new CommandAgent();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = req.body;
      const result = await agent.processCommand(body);
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