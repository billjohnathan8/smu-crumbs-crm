package com.itsa.crm.agentservice.security;

/**
 * Raised when an authenticated user lacks required permissions.
 */
public class ForbiddenException extends RuntimeException {
	public ForbiddenException(String message) {
		super(message);
	}
}
