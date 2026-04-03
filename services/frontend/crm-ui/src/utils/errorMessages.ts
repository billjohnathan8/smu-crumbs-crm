const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Your session has expired. Please log in again.',
  forbidden: "You don't have permission to perform this action.",
  not_found: 'The requested resource was not found.',
  validation_failed: 'Please check your input and try again.',
  validation_error: 'Please check your input and try again.',
  password_policy_violation:
    'Password does not meet policy requirements. Include lowercase, number, special character, and 8-128 chars.',
  conflict: 'This record has already been modified. Please refresh and try again.',
  service_unavailable: 'Service is temporarily unavailable. Please try again shortly.',
  request_timeout: 'Request timed out. Please try again.',
  network_error: 'Network error occurred. Please check your connection and try again.',
  unknown_error: 'An unexpected error occurred. Please try again.',
}

const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.'

export function getUserFriendlyErrorMessage(errorCode?: string): string {
  if (!errorCode) {
    return GENERIC_ERROR_MESSAGE
  }
  return ERROR_MESSAGES[errorCode] ?? GENERIC_ERROR_MESSAGE
}
