import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectionManager } from '../../src/connections/connectionManager.js';
import { ServerConfig } from '../../src/contracts/types.js';

class MockMemento {
  private data = new Map<string, any>();
  get<T>(key: string, defaultValue?: T): T {
    return this.data.has(key) ? this.data.get(key) : (defaultValue as T);
  }
  async update(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }
}

class MockSecretStorage {
  private secrets = new Map<string, string>();
  async get(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }
  async store(key: string, value: string): Promise<void> {
    this.secrets.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.secrets.delete(key);
  }
  onDidChange = { dispose: () => {} } as any;
}

describe('ConnectionManager', () => {
  let memento: MockMemento;
  let secrets: MockSecretStorage;
  let cm: ConnectionManager;

  beforeEach(() => {
    memento = new MockMemento();
    secrets = new MockSecretStorage();
    cm = new ConnectionManager(memento as any, secrets as any);
  });

  it('starts with empty list of servers', () => {
    expect(cm.list()).toEqual([]);
  });

  it('adds server and stores password in secret storage', async () => {
    const srv = await cm.add(
      {
        name: 'Test Server',
        url: 'http://localhost:5000/',
        username: 'unlocker',
      },
      'secret-pass'
    );

    expect(srv.id).toBeDefined();
    expect(srv.url).toBe('http://localhost:5000'); // trailing slash stripped
    expect(cm.list().length).toBe(1);
    expect(cm.get(srv.id)?.name).toBe('Test Server');

    const creds = await cm.getCredentials(srv.id);
    expect(creds.username).toBe('unlocker');
    expect(creds.password).toBe('secret-pass');
  });

  it('updates server details and optional password', async () => {
    const srv = await cm.add(
      {
        name: 'Old Name',
        url: 'http://localhost:5000',
        username: 'unlocker',
      },
      'old-pass'
    );

    await cm.update({ ...srv, name: 'New Name' }, 'new-pass');
    expect(cm.get(srv.id)?.name).toBe('New Name');

    const creds = await cm.getCredentials(srv.id);
    expect(creds.password).toBe('new-pass');
  });

  it('removes server and deletes secret', async () => {
    const srv = await cm.add(
      {
        name: 'To Delete',
        url: 'http://localhost:5000',
        username: 'unlocker',
      },
      'pass'
    );

    expect(cm.list().length).toBe(1);
    await cm.remove(srv.id);
    expect(cm.list().length).toBe(0);
    expect(cm.get(srv.id)).toBeUndefined();
  });

  it('manages connection state lifecycle with mock client', async () => {
    const mockPing = vi.fn().mockResolvedValue({ ok: true, elapsedMs: 15 });
    const mockClient = { ping: mockPing } as any;

    const cmWithClient = new ConnectionManager(
      memento as any,
      secrets as any,
      () => mockClient
    );

    const srv = await cmWithClient.add(
      { name: 'Live', url: 'http://localhost:5000', username: 'u' },
      'p'
    );

    expect(cmWithClient.state(srv.id)).toBe('disconnected');

    await cmWithClient.connect(srv.id);
    expect(cmWithClient.state(srv.id)).toBe('connected');
    expect(mockPing).toHaveBeenCalledWith(srv.id);

    cmWithClient.disconnect(srv.id);
    expect(cmWithClient.state(srv.id)).toBe('disconnected');
  });

  it('marks state as error if ping fails', async () => {
    const mockPing = vi.fn().mockResolvedValue({ ok: false, error: 'Connection refused' });
    const mockClient = { ping: mockPing } as any;

    const cmWithClient = new ConnectionManager(
      memento as any,
      secrets as any,
      () => mockClient
    );

    const srv = await cmWithClient.add(
      { name: 'Failing', url: 'http://localhost:9999', username: 'u' },
      'p'
    );

    await expect(cmWithClient.connect(srv.id)).rejects.toThrow('Connection refused');
    expect(cmWithClient.state(srv.id)).toBe('error');
  });
});
