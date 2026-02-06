package com.itsa.crm.transactions_service.dto;

import java.time.Instant;

public record ImportBatchDto(
	String importBatchId,
	ImportBatchStatus status,
	String requestedClientId,
	Instant requestedAt,
	Instant startedAt,
	Instant finishedAt,
	int totalRecords,
	int importedRecords,
	int failedRecords,
	String errorMessage
) {}

