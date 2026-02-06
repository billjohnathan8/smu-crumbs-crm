package com.itsa.crm.clients_service.api;

public record Pagination(
	int limit,
	int offset,
	long total
) {}

