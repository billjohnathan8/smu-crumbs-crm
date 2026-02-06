package com.itsa.crm.clients_service.exception;

public class AccountNotFoundException extends RuntimeException {
	public AccountNotFoundException(String accountId) {
		super("Account not found");
	}
}

