package com.itsa.crm.userservice.security;

public class JwtValidationException extends RuntimeException {
	public JwtValidationException(String message) {
		super(message);
	}
}

