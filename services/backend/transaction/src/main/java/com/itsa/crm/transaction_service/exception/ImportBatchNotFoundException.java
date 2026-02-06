package com.itsa.crm.transaction_service.exception;

/**
 * Raised when an import batch id is not present in storage.
 */
public class ImportBatchNotFoundException extends RuntimeException {
	public ImportBatchNotFoundException(String importBatchId) {
		super("Import batch not found: " + importBatchId);
	}
}

