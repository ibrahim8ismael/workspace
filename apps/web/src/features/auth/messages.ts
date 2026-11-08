import { ApiError } from '../../lib/api';

export function messageForApi(error: unknown) {
  if (!(error instanceof ApiError)) return 'The request could not be completed. Try again.';
  if (error.outcomeUnknown)
    return 'The connection ended before we could confirm the result. You can retry this submission.';
  switch (error.code) {
    case 'invalid_credentials':
      return 'That email and password do not match. Check them and try again.';
    case 'invalid_token':
    case 'invalid_invitation':
      return 'That code is invalid, expired, or has already been used.';
    case 'validation_failed':
      return 'Check the entered details and try again.';
    case 'rate_limited':
      return 'Too many attempts. Wait a little before trying again.';
    case 'csrf_rejected':
      return 'The request could not be verified. Try submitting it again.';
    case 'reauthentication_required':
      return 'Verify your password first, then enter your current and new passwords again.';
    case 'mutation_in_progress':
      return 'Another action is still in progress. Wait for it to finish, then try again.';
    case 'network_unavailable':
      return 'Could not reach the service. Check your connection and try again.';
    case 'workspace_quota':
      return 'This account has reached its company limit.';
    case 'idempotency_conflict':
      return 'This submission changed. Review the details and submit it again.';
    default:
      return 'The request could not be completed. Check the details and try again.';
  }
}
