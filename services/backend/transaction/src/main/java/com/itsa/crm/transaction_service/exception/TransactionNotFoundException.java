package com.itsa.crm.transaction_service.exception;

/**
 * Raised when a transaction id cannot be located in storage.
 */
public class TransactionNotFoundException extends RuntimeException {
	public TransactionNotFoundException(String transactionId) {
		super("Transaction not found: " + transactionId);
	}
}

