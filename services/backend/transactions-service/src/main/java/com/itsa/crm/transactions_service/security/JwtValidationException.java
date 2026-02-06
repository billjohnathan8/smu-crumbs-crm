package com.itsa.crm.transactions_service.security;

public class JwtValidationException extends RuntimeException {
	public JwtValidationException(String message) {
		super(message);
	}
}


