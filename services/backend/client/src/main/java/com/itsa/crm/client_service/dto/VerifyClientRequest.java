package com.itsa.crm.client_service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request payload for verifying a client's identity document.
 */
public record VerifyClientRequest(
	@NotBlank
	@Size(min = 6, max = 20)
	String nric,
	@Pattern(regexp = "^NRIC$", message = "documentType must be NRIC")
	String documentType,
	String documentRef
) {}
