/**
 * Pull Requests API - Get linked PRs for work items
 */

import type { AdoClient } from './client.js';
import type { AdoPullRequestsResponse, AdoWorkItemResponse } from '../types/ado-api.js';
import type { AdoPullRequest } from '../types/work-item.js';
import { LINK_TYPES } from '../types/ado-api.js';

/**
 * PR link type in ADO
 */
const PR_LINK_TYPE = 'ArtifactLink';
const PR_LINK_NAME = 'Pull Request';

/**
 * Get pull requests linked to a work item
 */
export async function getLinkedPullRequests(
  client: AdoClient,
  workItem: AdoWorkItemResponse
): Promise<AdoPullRequest[]> {
  const pullRequests: AdoPullRequest[] = [];

  if (!workItem.relations) {
    return pullRequests;
  }

  // Find PR links in relations
  const prRelations = workItem.relations.filter(
    rel => rel.rel === PR_LINK_TYPE && rel.attributes?.name === PR_LINK_NAME
  );

  for (const relation of prRelations) {
    // Parse PR info from URL
    // Format: vstfs:///Git/PullRequestId/{project}/{repository}/{prId}
    const prInfo = parsePullRequestUrl(relation.url);
    if (prInfo) {
      try {
        const pr = await getPullRequest(client, prInfo.repository, prInfo.prId);
        if (pr) {
          pullRequests.push(pr);
        }
      } catch {
        // PR might not be accessible, skip it
      }
    }
  }

  return pullRequests;
}

/**
 * Get a specific pull request
 */
async function getPullRequest(
  client: AdoClient,
  repository: string,
  prId: number
): Promise<AdoPullRequest | null> {
  const project = client.getProject();
  const organization = client.getOrganization();

  try {
    const response = await client.get<{
      pullRequestId: number;
      title: string;
      status: string;
      repository: { name: string };
    }>(`/${project}/_apis/git/repositories/${repository}/pullrequests/${prId}`);

    return {
      id: response.pullRequestId,
      title: response.title,
      status: response.status,
      url: `https://dev.azure.com/${organization}/${project}/_git/${repository}/pullrequest/${prId}`,
      repository: response.repository.name,
    };
  } catch {
    return null;
  }
}

/**
 * Search for pull requests linked to a work item by ID
 */
export async function searchPullRequestsByWorkItem(
  client: AdoClient,
  workItemId: number
): Promise<AdoPullRequest[]> {
  const project = client.getProject();
  const organization = client.getOrganization();

  try {
    // Get all repositories in the project
    const repos = await client.get<{ value: Array<{ id: string; name: string }> }>(
      `/${project}/_apis/git/repositories`
    );

    const pullRequests: AdoPullRequest[] = [];

    // Search each repository for PRs linked to this work item
    for (const repo of repos.value) {
      try {
        const prs = await client.get<AdoPullRequestsResponse>(
          `/${project}/_apis/git/repositories/${repo.id}/pullrequests`,
          {
            'searchCriteria.status': 'all',
            '$top': 100,
          }
        );

        // Filter PRs that are linked to this work item
        for (const pr of prs.value) {
          // Check if PR is linked to the work item
          // This requires fetching PR details with work item links
          const prDetails = await client.get<{
            pullRequestId: number;
            title: string;
            status: string;
            workItemRefs?: Array<{ id: string }>;
          }>(
            `/${project}/_apis/git/repositories/${repo.id}/pullrequests/${pr.pullRequestId}`,
            { includeWorkItemRefs: 'true' }
          );

          if (prDetails.workItemRefs?.some(ref => parseInt(ref.id) === workItemId)) {
            pullRequests.push({
              id: prDetails.pullRequestId,
              title: prDetails.title,
              status: prDetails.status,
              url: `https://dev.azure.com/${organization}/${project}/_git/${repo.name}/pullrequest/${prDetails.pullRequestId}`,
              repository: repo.name,
            });
          }
        }
      } catch {
        // Repository might not have PRs or be inaccessible
      }
    }

    return pullRequests;
  } catch {
    return [];
  }
}

/**
 * Parse PR URL to extract repository and PR ID
 */
function parsePullRequestUrl(url: string): { repository: string; prId: number } | null {
  // Format: vstfs:///Git/PullRequestId/{project}/{repository}/{prId}
  const match = url.match(/vstfs:\/\/\/Git\/PullRequestId\/[^/]+\/([^/]+)\/(\d+)/);
  if (match) {
    return {
      repository: match[1]!,
      prId: parseInt(match[2]!, 10),
    };
  }
  return null;
}
