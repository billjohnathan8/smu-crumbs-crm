package com.scroogebank.crm.client_service.dto;

import java.util.List;

/**
 * Aggregate signal for pending client verification submissions.
 */
public record VerificationSubmissionSummaryResponse(
	long pendingSubmissionCount,
	List<PendingSubmissionBreakdown> pendingSubmissionsByAgent
) {
	public VerificationSubmissionSummaryResponse(long pendingSubmissionCount) {
		this(pendingSubmissionCount, List.of());
	}

	public record PendingSubmissionBreakdown(
		String assignedUserId,
		long pendingSubmissionCount
	) {}
}
