package com.scroogebank.crm.client_service.api;

/**
 * Pagination metadata for list responses.
 */
public record Pagination(
	int limit,
	int offset,
	long total
) {}
