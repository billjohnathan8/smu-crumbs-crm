package com.itsa.crm.clients_service.security;

/**
 * Raised when a request lacks valid authentication.
 */
public class UnauthorizedException extends RuntimeException {
	public UnauthorizedException(String message) {
		super(message);
	}
}
