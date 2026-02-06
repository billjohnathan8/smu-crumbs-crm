package com.itsa.crm.transactions_service.security;

/**
 * Raised when an authenticated user attempts an unauthorized action.
 */
public class ForbiddenException extends RuntimeException {
	public ForbiddenException(String message) {
		super(message);
	}
}


