package com.itsa.crm.clients_service.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record ClientUpsertRequest(
	@Valid
	@NotNull
	ClientPayload client,
	String agentId
) {}
