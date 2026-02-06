package com.itsa.crm.agentservice.api;

/**
 * Pagination metadata returned alongside list responses.
 *
 * @param limit requested page size after normalization
 * @param offset zero-based index of the first element
 * @param total total number of matching records
 */
public record Pagination(
	int limit,
	int offset,
	long total
) {}
