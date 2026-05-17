/**
 * HTTP/SSE Server implementation
 * 
 * Handles HTTP/1.1 requests with Bearer Token authentication
 * and Server-Sent Events (SSE) for real-time updates.
 */

import * as http from 'http';
import { DaemonConfig } from '../daemon/DaemonConfig';
import { EventBus } from '../event-bus/EventBus';
import { Event } from '../types';
import { ContentAddressableStorage } from '../cas';

export class HTTPServer {
  private server: http.Server | null = null;
  private port: number | null = null;
  private eventBus: EventBus | null = null;
  private token: string | null = null;
  private cas: ContentAddressableStorage;

  constructor(_config: DaemonConfig, eventBus?: EventBus) {
    this.eventBus = eventBus || null;
    this.cas = new ContentAddressableStorage();
  }

  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
  }

  /**
   * Set the bearer token for authentication
   * 
   * @param token The token to validate against
   */
  setToken(token: string): void {
    this.token = token;
  }

  async start(): Promise<{ port: number }> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
          resolve({ port: this.port });
        } else {
          reject(new Error('Failed to get server port'));
        }
      });

      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.server = null;
            this.port = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  broadcastEvent(event: Event): void {
    if (this.eventBus) {
      this.eventBus.publish(event);
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Read request body
    const chunks: Buffer[] = [];
    
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      this.handleRequestWithBody(req, res, body);
    });
    
    req.on('error', (error) => {
      console.error('Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    });
  }

  private handleRequestWithBody(req: http.IncomingMessage, res: http.ServerResponse, body: Buffer): void {
    const config = new DaemonConfig();
    const maxSize = config.getMaxPayloadSize();
    
    // Check payload size
    if (body.length > maxSize) {
      console.warn(`[PAYLOAD] Payload size ${body.length} bytes exceeds limit ${maxSize} bytes`);
      
      // Store in CAS and return reference
      this.cas.store(body).then((casReference) => {
        console.log(`[PAYLOAD] Stored large payload in CAS: ${casReference.reference}`);
        
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Payload Too Large',
          reason: `Payload size ${body.length} bytes exceeds limit of ${maxSize} bytes`,
          casReference,
        }));
      }).catch((error) => {
        console.error('[PAYLOAD] Failed to store payload in CAS:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Internal Server Error', 
          reason: 'Failed to store large payload in CAS' 
        }));
      });
      return;
    }

    // Validate Bearer Token
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logPermissionDenied(req, 'Missing or invalid Authorization header');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized', reason: 'Missing or invalid Authorization header' }));
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!this.token) {
      this.logPermissionDenied(req, 'Server token not initialized');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', reason: 'Server token not initialized' }));
      return;
    }

    if (token !== this.token) {
      this.logPermissionDenied(req, 'Invalid token');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized', reason: 'Invalid token' }));
      return;
    }

    // Route request to appropriate handler
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    
    switch (url.pathname) {
      case '/events':
        this.handleSSE(res);
        break;
      case '/':
        this.handleRoot(res);
        break;
      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
  }

  /**
   * Log permission denied events for observability
   */
  private logPermissionDenied(req: http.IncomingMessage, reason: string): void {
    const event: Event = {
      eventId: this.generateEventId(),
      ts: Date.now(),
      projectId: '', // No project context for auth events
      action: 'permission.denied',
      payload: {
        method: req.method,
        path: req.url,
        reason,
        clientIp: req.socket.remoteAddress || 'unknown',
      },
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };
    
    if (this.eventBus) {
      this.eventBus.publish(event);
    }
    
    console.warn(`[AUTH] Permission denied: ${reason} - ${req.method} ${req.url}`);
  }

  private generateEventId(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }

  private handleSSE(res: http.ServerResponse): void {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial message
    res.write('data: connected\n\n');

    // Keep connection open
    // Implementation will be completed in Phase 2
  }

  private handleRoot(res: http.ServerResponse): void {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', service: 'daemon-core' }));
  }
}
