package com.scroogebank.crm.client_service.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/**
 * Request payload for upserting a client with agent context.
 */
public record ClientUpsertRequest(
	@Valid
	@NotNull
	ClientPayload client,
	String agentId
) {}
