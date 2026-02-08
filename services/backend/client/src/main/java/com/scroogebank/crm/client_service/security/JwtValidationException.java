package com.scroogebank.crm.client_service.security;

/**
 * Raised when a JWT fails validation.
 */
public class JwtValidationException extends RuntimeException {
	public JwtValidationException(String message) {
		super(message);
	}
}
