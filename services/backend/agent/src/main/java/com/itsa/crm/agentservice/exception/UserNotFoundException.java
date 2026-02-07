package com.itsa.crm.agentservice.exception;

/**
 * Raised when a user cannot be located by identifier.
 */
public class UserNotFoundException extends RuntimeException {
	public UserNotFoundException(String userId) {
		super("User not found: " + userId);
	}
}
