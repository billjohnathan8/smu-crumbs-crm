package com.scroogebank.crm.user_service.exception;

/**
 * Raised when an operation depends on a downstream service that is unavailable.
 */
public class DownstreamDependencyException extends RuntimeException {
	public DownstreamDependencyException(String message) {
		super(message);
	}
}

