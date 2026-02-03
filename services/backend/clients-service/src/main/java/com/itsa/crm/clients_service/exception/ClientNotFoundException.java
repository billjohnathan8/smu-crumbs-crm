package com.itsa.crm.clients_service.exception;

public class ClientNotFoundException extends RuntimeException {
	public ClientNotFoundException(Long clientId) {
		super("Client Id " + clientId + " not found");
	}
}
