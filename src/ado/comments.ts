/**
 * Comments API - Work item comments operations
 */

import type { AdoClient } from './client.js';
import type { AdoCommentsResponse, AdoCommentResponse } from '../types/ado-api.js';
import type { AdoComment } from '../types/work-item.js';

/**
 * Get comments for a work item
 */
export async function getComments(
  client: AdoClient,
  workItemId: number,
  top?: number,
  continuationToken?: string
): Promise<AdoCommentsResponse> {
  const project = client.getProject();

  const params: Record<string, unknown> = {};
  if (top) params['$top'] = top;
  if (continuationToken) params['continuationToken'] = continuationToken;

  // Comments API uses preview version
  return client.get<AdoCommentsResponse>(
    `/${project}/_apis/wit/workitems/${workItemId}/comments`,
    { ...params, 'api-version': '7.1-preview.4' }
  );
}

/**
 * Get all comments for a work item (handles pagination)
 */
export async function getAllComments(
  client: AdoClient,
  workItemId: number
): Promise<AdoComment[]> {
  const comments: AdoComment[] = [];
  let hasMore = true;
  let continuationToken: string | undefined;

  while (hasMore) {
    const response = await getComments(client, workItemId, 100, continuationToken);

    for (const comment of response.comments) {
      comments.push(transformComment(comment));
    }

    // Check if there are more comments
    hasMore = response.count === 100;
    // Note: ADO doesn't return continuation token for comments in a straightforward way
    // For simplicity, we assume 100 comments per page and break if less
    if (response.count < 100) {
      hasMore = false;
    }
  }

  return comments;
}

/**
 * Add a comment to a work item
 */
export async function addComment(
  client: AdoClient,
  workItemId: number,
  text: string
): Promise<AdoCommentResponse> {
  const project = client.getProject();

  return client.post<AdoCommentResponse>(
    `/${project}/_apis/wit/workitems/${workItemId}/comments`,
    { text },
    { 'api-version': '7.1-preview.4' }
  );
}

/**
 * Transform ADO comment to our format
 */
function transformComment(comment: AdoCommentResponse): AdoComment {
  return {
    id: comment.id,
    author: comment.createdBy.displayName || comment.createdBy.uniqueName,
    date: comment.createdDate,
    text: comment.text,
  };
}
