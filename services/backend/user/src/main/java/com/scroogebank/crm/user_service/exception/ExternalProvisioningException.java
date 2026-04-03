package com.scroogebank.crm.user_service.exception;

/**
 * Raised when upstream identity-provider provisioning fails for reasons that are
 * not caused by request validation.
 */
public class ExternalProvisioningException extends RuntimeException {
	public ExternalProvisioningException(String message, Throwable cause) {
		super(message, cause);
	}
}
