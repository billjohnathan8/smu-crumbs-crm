package com.itsa.crm.transaction_service.api;

/**
 * Pagination metadata for list responses.
 */
public record Pagination(
	int limit,
	int offset,
	long total
) {}



