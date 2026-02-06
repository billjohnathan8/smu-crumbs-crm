package com.itsa.crm.transactions_service.exception;

public class TransactionNotFoundException extends RuntimeException {
	public TransactionNotFoundException(String transactionId) {
		super("Transaction not found: " + transactionId);
	}
}

