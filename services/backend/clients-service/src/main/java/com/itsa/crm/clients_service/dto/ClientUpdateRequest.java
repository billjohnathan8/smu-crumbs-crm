package com.itsa.crm.clients_service.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record ClientUpdateRequest(
	@NotNull
	@Valid
	ClientPayload client,
	String agentId
) {}
