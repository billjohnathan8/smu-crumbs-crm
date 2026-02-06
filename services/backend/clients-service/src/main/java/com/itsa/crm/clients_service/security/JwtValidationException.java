package com.itsa.crm.clients_service.security;

public class JwtValidationException extends RuntimeException {
	public JwtValidationException(String message) {
		super(message);
	}
}

