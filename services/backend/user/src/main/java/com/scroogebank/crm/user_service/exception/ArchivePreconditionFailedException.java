package com.scroogebank.crm.user_service.exception;

/**
 * Raised when a user archive request violates mandatory preconditions.
 */
public class ArchivePreconditionFailedException extends RuntimeException {
	public ArchivePreconditionFailedException(String message) {
		super(message);
	}
}

