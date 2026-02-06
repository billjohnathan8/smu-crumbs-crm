package com.itsa.crm.userservice.api;

public record Pagination(
	int limit,
	int offset,
	long total
) {}

