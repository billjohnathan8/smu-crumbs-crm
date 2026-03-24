package com.scroogebank.crm.transaction_service.dto;

/**
 * Request payload for importing transactions from the configured source
 * (filesystem mock directory or S3-backed mock ingestion bucket).
 */
public record ImportTransactionsRequest(
	String clientId,
	String sourcePath
) {}
