package com.scroogebank.crm.user_service.security;

/**
 * Raised when an authenticated user lacks required permissions.
 */
public class ForbiddenException extends RuntimeException {
	public ForbiddenException(String message) {
		super(message);
	}
}
