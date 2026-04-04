package com.scroogebank.crm.client_service.exception;

/**
 * Raised when account opening is blocked by client verification-state policy.
 */
public class AccountOpeningNotAllowedException extends RuntimeException {
	public AccountOpeningNotAllowedException(String message) {
		super(message);
	}
}
