package com.itsa.crm.transactions_service.exception;

public class UserNotFoundException extends RuntimeException {
	public UserNotFoundException(String userId) {
		super("User not found: " + userId);
	}
}


