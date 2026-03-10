package com.scroogebank.crm.client_service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Request payload for verifying a client's identity document.
 */
public record VerifyClientRequest(
	@NotBlank
	@Pattern(regexp = "^[STFGM]\\d{7}[A-Z]$", message = "NRIC must follow Singapore format (e.g. S1234567D)")
	String nric,
	@Pattern(regexp = "^NRIC$", message = "documentType must be NRIC")
	String documentType,
	String documentRef
) {}
