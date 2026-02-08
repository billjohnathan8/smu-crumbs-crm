package com.scroogebank.crm.client_service.exception;

/**
 * Raised when a client cannot be found or accessed.
 */
public class ClientNotFoundException extends RuntimeException {
	public ClientNotFoundException(String clientId) {
		super("Client not found");
	}
}
