package com.itsa.crm.transactions_service.exception;

/**
 * Raised when a user creation/update would violate a unique email constraint.
 */
public class DuplicateUserException extends RuntimeException {
	public DuplicateUserException(String message) {
		super(message);
	}
}


