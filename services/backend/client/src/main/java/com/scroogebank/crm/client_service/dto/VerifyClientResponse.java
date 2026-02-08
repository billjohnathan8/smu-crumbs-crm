package com.scroogebank.crm.client_service.dto;

/**
 * Response payload reporting the client's verification status.
 */
public record VerifyClientResponse(
	String clientId,
	IdentityVerificationStatus identityVerificationStatus
) {}
