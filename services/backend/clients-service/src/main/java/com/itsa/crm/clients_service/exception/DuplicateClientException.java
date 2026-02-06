package com.itsa.crm.clients_service.exception;

/**
 * Raised when a unique client field (email or phone) already exists.
 */
public class DuplicateClientException extends RuntimeException {
	public DuplicateClientException(String message) {
		super(message);
	}
}
