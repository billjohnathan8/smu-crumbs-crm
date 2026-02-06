package com.itsa.crm.transaction_service.exception;

/**
 * Raised when a user id cannot be located in storage.
 */
public class UserNotFoundException extends RuntimeException {
	public UserNotFoundException(String userId) {
		super("User not found: " + userId);
	}
}



