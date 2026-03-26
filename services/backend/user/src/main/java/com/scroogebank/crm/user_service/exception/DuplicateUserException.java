package com.scroogebank.crm.user_service.exception;

/**
 * Raised when a user with the same unique attribute already exists.
 */
public class DuplicateUserException extends RuntimeException {
	public DuplicateUserException(String message) {
		super(message);
	}
}
