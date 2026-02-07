package com.itsa.crm.transaction_service.security;

/**
 * Raised when JWT parsing or validation fails.
 */
public class JwtValidationException extends RuntimeException {
	public JwtValidationException(String message) {
		super(message);
	}
}



