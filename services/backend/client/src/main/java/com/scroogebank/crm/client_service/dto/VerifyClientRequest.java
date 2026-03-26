package com.scroogebank.crm.client_service.dto;

import jakarta.validation.constraints.NotNull;

/**
 * Request payload for verifying a client's identity document.
 */
public record VerifyClientRequest(
    @NotNull
	Boolean approved
) {}
