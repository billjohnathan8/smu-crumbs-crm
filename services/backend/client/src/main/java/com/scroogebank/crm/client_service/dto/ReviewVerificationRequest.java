package com.scroogebank.crm.client_service.dto;

import jakarta.validation.constraints.NotNull;

/**
 * Request payload for an admin/supervisor to approve or reject a pending verification.
 */
public record ReviewVerificationRequest(
	@NotNull(message = "action is required")
	ReviewAction action
) {
	/**
	 * Allowed review actions for a pending verification.
	 */
	public enum ReviewAction {
		approve,
		reject
	}
}
