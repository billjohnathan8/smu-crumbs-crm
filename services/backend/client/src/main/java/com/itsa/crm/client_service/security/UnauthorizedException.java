package com.itsa.crm.client_service.security;

/**
 * Raised when a request lacks valid authentication.
 */
public class UnauthorizedException extends RuntimeException {
	public UnauthorizedException(String message) {
		super(message);
	}
}
