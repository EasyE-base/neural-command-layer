import http from 'http';
import { CommandAgent } from './CommandAgent.js';
import pino from 'pino';

const logger = pino({ name: '@swarm/command-agent' });
const agent = new CommandAgent();

// Register tools
const tools = new Map();
for (const tool of agent.getTools()) {
  tools.set(tool.name, tool);
  logger.info({ tool: tool.name }, 'registered tool');
}

const server = http.createServer(async (req, res) => {
  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-agent-role, x-agent-id, x-correlation-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'command-agent' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/call') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const { tool, input } = body;

      if (!tools.has(tool)) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'tool_not_found', tool }));
        return;
      }

      const result = await agent.handleToolCall(tool, input);
      
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // Direct command processing endpoint for easier testing
    if (req.method === 'POST' && req.url === '/command') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const result = await agent.processCommand(body);
      
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));

  } catch (error: any) {
    logger.error({ error: error.message }, 'Request handling error');
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'internal_error', 
      message: error.message 
    }));
  }
});

const port = Number(process.env.PORT || 4010);
server.listen(port, () => {
  logger.info({ port }, 'Command Agent server listening');
});