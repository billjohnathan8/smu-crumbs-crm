package com.itsa.crm.transactions_service.api;

/**
 * Pagination metadata for list responses.
 */
public record Pagination(
	int limit,
	int offset,
	long total
) {}


