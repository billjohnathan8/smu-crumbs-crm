package com.scroogebank.crm.user_service.security;

/**
 * Raised when a request is not authenticated or credentials are invalid.
 */
public class UnauthorizedException extends RuntimeException {
	public UnauthorizedException(String message) {
		super(message);
	}
}
