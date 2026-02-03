package com.itsa.crm.clients_service.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record ClientCreateRequest(
	@NotNull
	@Valid
	ClientPayload client,
	String agentId
) {}
