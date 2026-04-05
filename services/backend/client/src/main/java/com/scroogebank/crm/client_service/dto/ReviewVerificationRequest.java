package com.scroogebank.crm.client_service.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request payload for an admin/supervisor to approve or reject a pending verification.
 */
public record ReviewVerificationRequest(
	@NotNull(message = "action is required")
	ReviewAction action,

	@Size(max = 2000, message = "reviewer notes must not exceed 2000 characters")
	String reviewerNotes
) {
	/**
	 * Allowed review actions for a pending verification.
	 */
	public enum ReviewAction {
		approve,
		reject
	}
}
