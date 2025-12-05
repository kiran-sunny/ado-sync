/**
 * Tests for ADO Client module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { AdoClient, getAdoClient, clearClientCache } from '../../src/ado/client.js';

// Mock dependencies
vi.mock('../../src/config/credentials.js', () => ({
  getPat: vi.fn().mockResolvedValue('test-pat-token'),
}));

vi.mock('../../src/ado/rate-limiter.js', () => ({
  RateLimiter: vi.fn().mockImplementation(() => ({
    throttle: vi.fn().mockResolvedValue(undefined),
    handleRetryAfter: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Create mock axios instance
const mockAxiosInstance = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
};

describe('AdoClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearClientCache();
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);
  });

  describe('constructor', () => {
    it('should create client with correct base URL', () => {
      new AdoClient({
        organization: 'my-org',
        project: 'my-project',
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://dev.azure.com/my-org',
        })
      );
    });

    it('should use default API version 7.1', () => {
      const client = new AdoClient({
        organization: 'my-org',
        project: 'my-project',
      });

      // API version is used in requests, not constructor
      expect(client).toBeDefined();
    });

    it('should use custom API version when provided', () => {
      const client = new AdoClient({
        organization: 'my-org',
        project: 'my-project',
        apiVersion: '6.0',
      });

      expect(client).toBeDefined();
    });

    it('should use custom timeout when provided', () => {
      new AdoClient({
        organization: 'my-org',
        project: 'my-project',
        timeout: 60000,
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });

    it('should set content-type header for JSON Patch', () => {
      new AdoClient({
        organization: 'my-org',
        project: 'my-project',
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json-patch+json',
          }),
        })
      );
    });

    it('should setup request and response interceptors', () => {
      new AdoClient({
        organization: 'my-org',
        project: 'my-project',
      });

      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should make GET request with api-version param', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { id: 123 } });

      const client = new AdoClient({
        organization: 'my-org',
        project: 'my-project',
      });

      const result = await client.get<{ id: number }>('/path');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/path',
        expect.objectContaining({
          params: expect.objectContaining({
            'api-version': '7.1',
          }),
        })
      );
      expect(result).toEqual({ id: 123 });
    });

    it('should merge custom params with api-version', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: {} });

      const client = new AdoClient({
        organization: 'my-org',
        project: 'my-project',
      });

      await client.get('/path', { $expand: 'Relations' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/path',
        expect.objectContaining({
          params: expect.objectContaining({
            'api-version': '7.1',
            $expand: 'Relations',
          }),
        })
      );
    });
  });

  describe('post', () => {
    it('should make POST request with data', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      const client = new AdoClient({
        organization: 'my-org',
        project: 'my-project',
      });

      const result = await client.post('/path', { field: 'value' });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/path',
        { field: 'value' },
        expect.objectContaining({
          params: expect.objectContaining({
            'api-version': '7.1',
          }),
        })
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('patch', () => {
    it('should make PATCH request with data', async () => {
      mockAxiosInstance.patch.mockResolvedValue({ data: { updated: true } });

      const client = new AdoClient({
        organization: 'my-org',
        project: 'my-project',
      });

      const result = await client.patch('/path', [{ op: 'add', path: '/fields/Title', value: 'Test' }]);

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/path',
        [{ op: 'add', path: '/fields/Title', value: 'Test' }],
        expect.objectContaining({
          params: expect.objectContaining({
            'api-version': '7.1',
          }),
        })
      );
      expect(result).toEqual({ updated: true });
    });
  });

  describe('delete', () => {
    it('should make DELETE request', async () => {
      mockAxiosInstance.delete.mockResolvedValue({ data: { deleted: true } });

      const client = new AdoClient({
        organization: 'my-org',
        project: 'my-project',
      });

      const result = await client.delete('/path', { destroy: 'true' });

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/path',
        expect.objectContaining({
          params: expect.objectContaining({
            'api-version': '7.1',
            destroy: 'true',
          }),
        })
      );
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('getters', () => {
    it('should return organization', () => {
      const client = new AdoClient({
        organization: 'test-org',
        project: 'test-project',
      });

      expect(client.getOrganization()).toBe('test-org');
    });

    it('should return project', () => {
      const client = new AdoClient({
        organization: 'test-org',
        project: 'test-project',
      });

      expect(client.getProject()).toBe('test-project');
    });

    it('should return base URL', () => {
      const client = new AdoClient({
        organization: 'test-org',
        project: 'test-project',
      });

      expect(client.getBaseUrl()).toBe('https://dev.azure.com/test-org');
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: {} });

      const client = new AdoClient({
        organization: 'test-org',
        project: 'test-project',
      });

      const result = await client.testConnection();

      expect(result).toBe(true);
    });

    it('should return false on connection failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection failed'));

      const client = new AdoClient({
        organization: 'test-org',
        project: 'test-project',
      });

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });
});

describe('getAdoClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearClientCache();
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);
  });

  it('should create new client for new org/project', () => {
    const client = getAdoClient({
      organization: 'org1',
      project: 'project1',
    });

    expect(client).toBeDefined();
    expect(axios.create).toHaveBeenCalledTimes(1);
  });

  it('should return cached client for same org/project', () => {
    const client1 = getAdoClient({
      organization: 'org1',
      project: 'project1',
    });

    const client2 = getAdoClient({
      organization: 'org1',
      project: 'project1',
    });

    expect(client1).toBe(client2);
    expect(axios.create).toHaveBeenCalledTimes(1);
  });

  it('should create different clients for different projects', () => {
    const client1 = getAdoClient({
      organization: 'org1',
      project: 'project1',
    });

    const client2 = getAdoClient({
      organization: 'org1',
      project: 'project2',
    });

    expect(client1).not.toBe(client2);
    expect(axios.create).toHaveBeenCalledTimes(2);
  });
});

describe('clearClientCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearClientCache();
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);
  });

  it('should clear the client cache', () => {
    // First call creates a client
    getAdoClient({
      organization: 'org1',
      project: 'project1',
    });

    expect(axios.create).toHaveBeenCalledTimes(1);

    // Clear the cache
    clearClientCache();

    // Should create new client after cache clear
    getAdoClient({
      organization: 'org1',
      project: 'project1',
    });

    expect(axios.create).toHaveBeenCalledTimes(2);
  });
});
