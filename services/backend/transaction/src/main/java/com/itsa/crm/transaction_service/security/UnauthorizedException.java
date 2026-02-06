package com.itsa.crm.transaction_service.security;

/**
 * Raised when a request lacks valid authentication credentials.
 */
public class UnauthorizedException extends RuntimeException {
	public UnauthorizedException(String message) {
		super(message);
	}
}



