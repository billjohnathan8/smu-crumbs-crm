package com.scroogebank.crm.client_service.dto;

/**
 * Request payload for updating an existing account (partial updates allowed).
 */
public record AccountUpdateRequest(
	AccountType accountType,
	AccountStatus accountStatus,
	String branchId
) {}
