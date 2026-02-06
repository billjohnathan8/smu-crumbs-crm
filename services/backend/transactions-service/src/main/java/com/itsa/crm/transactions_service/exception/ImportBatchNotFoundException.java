package com.itsa.crm.transactions_service.exception;

public class ImportBatchNotFoundException extends RuntimeException {
	public ImportBatchNotFoundException(String importBatchId) {
		super("Import batch not found: " + importBatchId);
	}
}

