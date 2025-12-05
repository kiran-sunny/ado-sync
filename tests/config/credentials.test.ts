/**
 * Tests for Credentials module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  storePat,
  getPat,
  deletePat,
  listStoredOrganizations,
  hasPatAvailable,
  isValidPatFormat,
} from '../../src/config/credentials.js';

// Mock keytar
const mockKeytar = {
  setPassword: vi.fn(),
  getPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn(),
};

vi.mock('keytar', () => mockKeytar);

describe('Credentials', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env['ADO_PAT'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('storePat', () => {
    it('should store PAT in keychain', async () => {
      mockKeytar.setPassword.mockResolvedValue(undefined);

      const result = await storePat('my-org', 'my-secret-pat');

      expect(mockKeytar.setPassword).toHaveBeenCalledWith('ado-sync', 'my-org', 'my-secret-pat');
      expect(result).toBe(true);
    });

    it('should return false when keytar fails', async () => {
      mockKeytar.setPassword.mockRejectedValue(new Error('Keychain access denied'));

      const result = await storePat('my-org', 'my-secret-pat');

      expect(result).toBe(false);
    });
  });

  describe('getPat', () => {
    it('should return PAT from environment variable first', async () => {
      process.env['ADO_PAT'] = 'env-pat-token';
      mockKeytar.getPassword.mockResolvedValue('keychain-pat');

      const result = await getPat('my-org');

      expect(result).toBe('env-pat-token');
      expect(mockKeytar.getPassword).not.toHaveBeenCalled();
    });

    it('should return PAT from keychain when env var not set', async () => {
      mockKeytar.getPassword.mockResolvedValue('keychain-pat');

      const result = await getPat('my-org');

      expect(result).toBe('keychain-pat');
      expect(mockKeytar.getPassword).toHaveBeenCalledWith('ado-sync', 'my-org');
    });

    it('should return null when no PAT available', async () => {
      mockKeytar.getPassword.mockResolvedValue(null);

      const result = await getPat('my-org');

      expect(result).toBeNull();
    });

    it('should return null when keychain access fails', async () => {
      mockKeytar.getPassword.mockRejectedValue(new Error('Access denied'));

      const result = await getPat('my-org');

      expect(result).toBeNull();
    });

    it('should not query keychain when organization not provided', async () => {
      const result = await getPat();

      expect(mockKeytar.getPassword).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('deletePat', () => {
    it('should delete PAT from keychain', async () => {
      mockKeytar.deletePassword.mockResolvedValue(true);

      const result = await deletePat('my-org');

      expect(mockKeytar.deletePassword).toHaveBeenCalledWith('ado-sync', 'my-org');
      expect(result).toBe(true);
    });

    it('should return false when PAT not found', async () => {
      mockKeytar.deletePassword.mockResolvedValue(false);

      const result = await deletePat('my-org');

      expect(result).toBe(false);
    });

    it('should return false when keychain fails', async () => {
      mockKeytar.deletePassword.mockRejectedValue(new Error('Access denied'));

      const result = await deletePat('my-org');

      expect(result).toBe(false);
    });
  });

  describe('listStoredOrganizations', () => {
    it('should list all stored organizations', async () => {
      mockKeytar.findCredentials.mockResolvedValue([
        { account: 'org1', password: 'pat1' },
        { account: 'org2', password: 'pat2' },
      ]);

      const result = await listStoredOrganizations();

      expect(result).toEqual(['org1', 'org2']);
    });

    it('should return empty array when no credentials', async () => {
      mockKeytar.findCredentials.mockResolvedValue([]);

      const result = await listStoredOrganizations();

      expect(result).toEqual([]);
    });

    it('should return empty array when keychain fails', async () => {
      mockKeytar.findCredentials.mockRejectedValue(new Error('Access denied'));

      const result = await listStoredOrganizations();

      expect(result).toEqual([]);
    });
  });

  describe('hasPatAvailable', () => {
    it('should return true when PAT is in environment', async () => {
      process.env['ADO_PAT'] = 'test-pat';

      const result = await hasPatAvailable();

      expect(result).toBe(true);
    });

    it('should return true when PAT is in keychain', async () => {
      mockKeytar.getPassword.mockResolvedValue('keychain-pat');

      const result = await hasPatAvailable('my-org');

      expect(result).toBe(true);
    });

    it('should return false when no PAT available', async () => {
      mockKeytar.getPassword.mockResolvedValue(null);

      const result = await hasPatAvailable('my-org');

      expect(result).toBe(false);
    });

    it('should return false for empty PAT', async () => {
      mockKeytar.getPassword.mockResolvedValue('');

      const result = await hasPatAvailable('my-org');

      expect(result).toBe(false);
    });
  });

  describe('isValidPatFormat', () => {
    it('should return true for valid PAT format', () => {
      // Typical Azure DevOps PAT is 52 characters
      const validPat = 'a'.repeat(52);

      expect(isValidPatFormat(validPat)).toBe(true);
    });

    it('should return true for alphanumeric PAT', () => {
      const pat = 'abc123XYZ456def789GHI012jkl345MNO678pqr901STU234';

      expect(isValidPatFormat(pat)).toBe(true);
    });

    it('should return false for PAT that is too short', () => {
      const shortPat = 'abc123';

      expect(isValidPatFormat(shortPat)).toBe(false);
    });

    it('should return false for PAT that is too long', () => {
      const longPat = 'a'.repeat(101);

      expect(isValidPatFormat(longPat)).toBe(false);
    });

    it('should return false for PAT with special characters', () => {
      const invalidPat = 'abc123!@#$%^&*()';

      expect(isValidPatFormat(invalidPat)).toBe(false);
    });

    it('should return false for PAT with spaces', () => {
      const invalidPat = 'abc 123 def 456';

      expect(isValidPatFormat(invalidPat)).toBe(false);
    });

    it('should return false for PAT with hyphens', () => {
      const invalidPat = 'abc123-def456-ghi789-jkl012-mno345';

      expect(isValidPatFormat(invalidPat)).toBe(false);
    });
  });
});
