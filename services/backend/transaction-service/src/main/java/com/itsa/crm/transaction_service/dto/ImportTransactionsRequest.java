package com.itsa.crm.transaction_service.dto;

/**
 * Request payload for importing transactions from a mock SFTP source.
 */
public record ImportTransactionsRequest(
	String clientId,
	String sourcePath
) {}

