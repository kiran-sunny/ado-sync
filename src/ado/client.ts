/**
 * Azure DevOps HTTP Client
 */

import axios, { type AxiosInstance, type AxiosError, type AxiosRequestConfig } from 'axios';
import { RateLimiter } from './rate-limiter.js';
import { getPat } from '../config/credentials.js';
import { retry, sleep } from '../utils/index.js';
import { debug, error as logError, warn } from '../utils/logger.js';
import type { AdoApiError } from '../types/index.js';

/**
 * ADO Client configuration
 */
export interface AdoClientConfig {
  organization: string;
  project: string;
  pat?: string;
  apiVersion?: string;
  timeout?: number;
}

/**
 * Azure DevOps API Client
 */
export class AdoClient {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;
  private readonly organization: string;
  private readonly project: string;
  private readonly apiVersion: string;

  constructor(config: AdoClientConfig) {
    this.organization = config.organization;
    this.project = config.project;
    this.apiVersion = config.apiVersion ?? '7.1';
    this.rateLimiter = new RateLimiter();

    // Create axios instance
    this.client = axios.create({
      baseURL: `https://dev.azure.com/${config.organization}`,
      timeout: config.timeout ?? 30000,
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
    });

    // Add request interceptor for auth and rate limiting
    this.client.interceptors.request.use(async reqConfig => {
      // Rate limiting
      await this.rateLimiter.throttle();

      // Add auth header
      const pat = config.pat ?? (await getPat(config.organization));
      if (!pat) {
        throw new Error(
          `No PAT found for organization "${config.organization}". ` +
            'Set ADO_PAT env var or use "ado-sync config set pat <token>".'
        );
      }

      const authHeader = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
      reqConfig.headers['Authorization'] = authHeader;

      debug(`ADO Request: ${reqConfig.method?.toUpperCase()} ${reqConfig.url}`);

      return reqConfig;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      async (error: AxiosError<AdoApiError>) => {
        return this.handleError(error);
      }
    );
  }

  /**
   * Handle API errors
   */
  private async handleError(error: AxiosError<AdoApiError>): Promise<never> {
    // Handle rate limiting
    if (error.response?.status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after'] as string, 10) || 60;
      await this.rateLimiter.handleRetryAfter(retryAfter);

      // Retry the request
      if (error.config) {
        return this.client.request(error.config);
      }
    }

    // Handle specific ADO errors
    if (error.response?.data) {
      const adoError = error.response.data;
      const message = adoError.message || 'Unknown Azure DevOps API error';
      logError(`ADO API Error: ${message}`);

      if (adoError.innerException) {
        logError(`Inner exception: ${adoError.innerException.message}`);
      }
    }

    throw error;
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.get<T>(path, {
      params: {
        'api-version': this.apiVersion,
        ...params,
      },
    });
    return response.data;
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, data?: unknown, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.post<T>(path, data, {
      params: {
        'api-version': this.apiVersion,
        ...params,
      },
    });
    return response.data;
  }

  /**
   * Make a PATCH request (for work item updates)
   */
  async patch<T>(path: string, data?: unknown, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.patch<T>(path, data, {
      params: {
        'api-version': this.apiVersion,
        ...params,
      },
    });
    return response.data;
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.delete<T>(path, {
      params: {
        'api-version': this.apiVersion,
        ...params,
      },
    });
    return response.data;
  }

  /**
   * Get organization name
   */
  getOrganization(): string {
    return this.organization;
  }

  /**
   * Get project name
   */
  getProject(): string {
    return this.project;
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return `https://dev.azure.com/${this.organization}`;
  }

  /**
   * Test connection to Azure DevOps
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.get(`/${this.project}/_apis/wit/workitemtypes`);
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Client instance cache
 */
const clientCache = new Map<string, AdoClient>();

/**
 * Get or create ADO client
 */
export function getAdoClient(config: AdoClientConfig): AdoClient {
  const key = `${config.organization}/${config.project}`;

  if (!clientCache.has(key)) {
    clientCache.set(key, new AdoClient(config));
  }

  return clientCache.get(key)!;
}

/**
 * Clear client cache
 */
export function clearClientCache(): void {
  clientCache.clear();
}
