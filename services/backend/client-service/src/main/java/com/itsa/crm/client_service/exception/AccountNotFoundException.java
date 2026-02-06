package com.itsa.crm.client_service.exception;

/**
 * Raised when an account cannot be found or accessed.
 */
public class AccountNotFoundException extends RuntimeException {
	public AccountNotFoundException(String accountId) {
		super("Account not found");
	}
}
