package com.scroogebank.crm.user_service.exception;

/**
 * Raised when a supplied password does not satisfy the configured identity-provider policy.
 */
public class PasswordPolicyViolationException extends RuntimeException {
	public PasswordPolicyViolationException(String message) {
		super(message);
	}
}
