package com.scroogebank.crm.client_service.dto;

/**
 * Authenticated response payload for a stored KYC document.
 */
public record VerificationDocumentResponse(
	String clientId,
	String documentKind,
	String documentType,
	String documentRef,
	String mimeType,
	String documentBase64
) {}
