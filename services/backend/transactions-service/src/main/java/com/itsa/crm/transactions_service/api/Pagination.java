package com.itsa.crm.transactions_service.api;

public record Pagination(
	int limit,
	int offset,
	long total
) {}


