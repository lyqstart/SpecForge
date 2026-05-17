/**
 * HTTP Server authentication tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HTTPServer } from '../../src/http/HTTPServer';
import { EventBus } from '../../src/event-bus/EventBus';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { HandshakeManager } from '../../src/daemon/HandshakeManager';
import * as http from 'http';

describe('HTTPServer Authentication', () => {
  let server: HTTPServer;
  let eventBus: EventBus;
  let config: DaemonConfig;
  let handshakeManager: HandshakeManager;
  let token: string;

  beforeEach(async () => {
    config = new DaemonConfig();
    eventBus = new EventBus();
    handshakeManager = new HandshakeManager(config);
    
    // Create a temporary handshake file for testing
    await handshakeManager.writeHandshakeFile(0);
    token = await handshakeManager.getToken();
  });

  afterEach(async () => {
    await server.stop();
    await handshakeManager.cleanup();
  });

  it('should return 401 for missing authorization header', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    
    await server.start();
    
    const result = await makeRequest(server, {
      method: 'GET',
      path: '/',
      headers: {},
    });
    
    expect(result.statusCode).toBe(401);
    expect(result.body).toContain('Unauthorized');
  });

  it('should return 401 for invalid authorization header', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    
    await server.start();
    
    const result = await makeRequest(server, {
      method: 'GET',
      path: '/',
      headers: {
        authorization: 'Bearer invalid-token',
      },
    });
    
    expect(result.statusCode).toBe(401);
    expect(result.body).toContain('Unauthorized');
  });

  it('should return 401 for missing Bearer prefix', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    
    await server.start();
    
    const result = await makeRequest(server, {
      method: 'GET',
      path: '/',
      headers: {
        authorization: token,
      },
    });
    
    expect(result.statusCode).toBe(401);
  });

  it('should return 200 for valid Bearer token', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    
    await server.start();
    
    const result = await makeRequest(server, {
      method: 'GET',
      path: '/',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('ok');
  });

  it('should record permission denied events', async () => {
    // Create a new event bus for this test
    const testEventBus = new EventBus();
    testEventBus.start(); // Start the event bus
    
    server = new HTTPServer(config, testEventBus);
    server.setToken(token);
    
    await server.start();
    
    // Subscribe after server starts (but before making request)
    const events: any[] = [];
    testEventBus.subscribe('permission.denied', (event) => {
      events.push(event);
    });
    
    // Make a request without authorization
    await makeRequest(server, {
      method: 'GET',
      path: '/',
      headers: {},
    });
    
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].action).toBe('permission.denied');
    expect(events[0].payload.reason).toBe('Missing or invalid Authorization header');
  });

  it('should return 413 for payload exceeding 64 KiB', async () => {
    // Create a new handshake manager for this test
    const testHandshakeManager = new HandshakeManager(config);
    await testHandshakeManager.writeHandshakeFile(0);
    const testToken = await testHandshakeManager.getToken();
    
    server = new HTTPServer(config, eventBus);
    server.setToken(testToken);
    
    await server.start();
    
    // Create payload larger than 64 KiB
    const largePayload = 'x'.repeat(65 * 1024);
    
    const result = await makeRequest(server, {
      method: 'POST',
      path: '/',
      headers: {
        authorization: `Bearer ${testToken}`,
        'Content-Type': 'text/plain',
        'Content-Length': largePayload.length.toString(),
      },
      body: largePayload,
    });
    
    expect(result.statusCode).toBe(413);
    expect(result.body).toContain('Payload Too Large');
    
    // Parse response to verify CAS reference is included
    const response = JSON.parse(result.body);
    expect(response.casReference).toBeDefined();
    expect(response.casReference.type).toBe('cas-blob');
    expect(response.casReference.hash).toContain('sha256-');
    expect(response.casReference.reference).toContain('cas://');
    
    // Cleanup
    await testHandshakeManager.cleanup();
  });
});

/**
 * Helper function to make HTTP requests to the test server
 */
function makeRequest(
  server: HTTPServer,
  options: {
    method: string;
    path: string;
    headers?: http.OutgoingHttpHeaders;
    body?: string;
  }
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const port = (server as any).port;
    
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method,
        headers: options.headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body,
          });
        });
      }
    );
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}
