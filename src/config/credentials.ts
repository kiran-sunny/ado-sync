/**
 * Credentials Manager - Handles secure storage of PAT tokens
 *
 * Uses keytar for OS keychain integration when available,
 * falls back to environment variables.
 */

const SERVICE_NAME = 'ado-sync';

// Keytar is optional - will use env var if not available
let keytar: typeof import('keytar') | null = null;

/**
 * Initialize keytar (lazy loading)
 */
async function getKeytar(): Promise<typeof import('keytar') | null> {
  if (keytar !== null) {
    return keytar;
  }

  try {
    keytar = await import('keytar');
    return keytar;
  } catch {
    // Keytar not available (e.g., in CI environments)
    return null;
  }
}

/**
 * Store PAT in secure storage
 */
export async function storePat(organization: string, pat: string): Promise<boolean> {
  const kt = await getKeytar();

  if (kt) {
    try {
      await kt.setPassword(SERVICE_NAME, organization, pat);
      return true;
    } catch (error) {
      console.error('Failed to store PAT in keychain:', error);
      return false;
    }
  }

  console.warn(
    'Keytar not available. PAT will not be stored securely. Use ADO_PAT environment variable.'
  );
  return false;
}

/**
 * Get PAT from secure storage or environment
 */
export async function getPat(organization?: string): Promise<string | null> {
  // First, try environment variable
  const envPat = process.env['ADO_PAT'];
  if (envPat) {
    return envPat;
  }

  // Then, try keychain if organization is provided
  if (organization) {
    const kt = await getKeytar();
    if (kt) {
      try {
        const pat = await kt.getPassword(SERVICE_NAME, organization);
        if (pat) {
          return pat;
        }
      } catch (error) {
        // Keychain access failed, continue to return null
      }
    }
  }

  return null;
}

/**
 * Delete PAT from secure storage
 */
export async function deletePat(organization: string): Promise<boolean> {
  const kt = await getKeytar();

  if (kt) {
    try {
      return await kt.deletePassword(SERVICE_NAME, organization);
    } catch (error) {
      console.error('Failed to delete PAT from keychain:', error);
      return false;
    }
  }

  return false;
}

/**
 * List all stored organizations
 */
export async function listStoredOrganizations(): Promise<string[]> {
  const kt = await getKeytar();

  if (kt) {
    try {
      const credentials = await kt.findCredentials(SERVICE_NAME);
      return credentials.map(c => c.account);
    } catch (error) {
      return [];
    }
  }

  return [];
}

/**
 * Check if PAT is available for organization
 */
export async function hasPatAvailable(organization?: string): Promise<boolean> {
  const pat = await getPat(organization);
  return pat !== null && pat.length > 0;
}

/**
 * Validate PAT format (basic validation)
 */
export function isValidPatFormat(pat: string): boolean {
  // Azure DevOps PATs are typically 52 characters
  // and contain alphanumeric characters
  if (pat.length < 40 || pat.length > 100) {
    return false;
  }

  // Check for valid characters
  return /^[a-zA-Z0-9]+$/.test(pat);
}
