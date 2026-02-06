package com.itsa.crm.userservice.security;

/**
 * Raised when JWT validation fails or a token is malformed.
 */
public class JwtValidationException extends RuntimeException {
	public JwtValidationException(String message) {
		super(message);
	}
}
