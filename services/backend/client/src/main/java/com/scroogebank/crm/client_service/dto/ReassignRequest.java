package com.scroogebank.crm.client_service.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request payload to transfer all clients from one agent to another.
 */
public record ReassignRequest(
	@NotBlank(message = "fromUserId is required")
	String fromUserId,
	@NotBlank(message = "toUserId is required")
	String toUserId
) {}
