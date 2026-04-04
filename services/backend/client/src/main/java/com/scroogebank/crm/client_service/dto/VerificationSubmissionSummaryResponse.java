package com.scroogebank.crm.client_service.dto;

/**
 * Aggregate signal for pending client verification submissions.
 */
public record VerificationSubmissionSummaryResponse(
	long pendingSubmissionCount
) {}
