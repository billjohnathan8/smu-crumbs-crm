package com.scroogebank.crm.client_service.dto;

import jakarta.validation.constraints.Pattern;

/**
 * Request payload for updating an existing account (partial updates allowed).
 */
public record AccountUpdateRequest(
	AccountType accountType,
	AccountStatus accountStatus,
	@Pattern(regexp = "^[A-Za-z0-9-]{2,40}$", message = "must be 2-40 chars using letters, numbers, and hyphens")
	String branchId
) {}
