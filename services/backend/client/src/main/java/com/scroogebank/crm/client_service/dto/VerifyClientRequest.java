package com.scroogebank.crm.client_service.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request payload for verifying a client's identity document.
 */
public record VerifyClientRequest(
    @NotBlank
	Boolean approved
) {}
