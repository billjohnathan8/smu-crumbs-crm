package com.itsa.crm.client_service.api;

/**
 * Pagination metadata for list responses.
 */
public record Pagination(
	int limit,
	int offset,
	long total
) {}
