package com.itsa.crm.clients_service.exception;

public class ClientNotFoundException extends RuntimeException {
	public ClientNotFoundException(String clientId) {
		super("Client not found");
	}
}
