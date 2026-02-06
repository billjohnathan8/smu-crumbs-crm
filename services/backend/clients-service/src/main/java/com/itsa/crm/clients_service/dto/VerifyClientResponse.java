package com.itsa.crm.clients_service.dto;

public record VerifyClientResponse(
	String clientId,
	IdentityVerificationStatus identityVerificationStatus
) {}

