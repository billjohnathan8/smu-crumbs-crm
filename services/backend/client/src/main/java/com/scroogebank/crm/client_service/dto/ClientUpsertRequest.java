package com.scroogebank.crm.client_service.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/**
 * Request payload for upserting a client with user context.
 */
public record ClientUpsertRequest(
	@Valid
	@NotNull
	ClientPayload client,
	String userId
) {}
