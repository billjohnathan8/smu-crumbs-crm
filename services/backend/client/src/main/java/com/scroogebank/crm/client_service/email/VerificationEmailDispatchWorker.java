package com.scroogebank.crm.client_service.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Scheduled worker that retries queued verification email communications.
 *
 * Legacy side-path for queued verification communication retries.
 * Canonical CRUMBS verification flow uses SNS -> verification Lambda for
 * email delivery. This worker is intentionally opt-in only.
 */
@Component
@ConditionalOnProperty(
	name = "app.verification-email.dispatch.enabled",
	havingValue = "true",
	matchIfMissing = false
)
public class VerificationEmailDispatchWorker {
	private static final Logger LOGGER = LoggerFactory.getLogger(VerificationEmailDispatchWorker.class);

	private final VerificationEmailDispatchService dispatchService;

	public VerificationEmailDispatchWorker(VerificationEmailDispatchService dispatchService) {
		this.dispatchService = dispatchService;
	}

	@Scheduled(fixedDelayString = "${app.verification-email.dispatch.poll-interval-ms:30000}")
	public void processQueuedCommunications() {
		try {
			dispatchService.processQueuedCommunications();
		}
		catch (Exception ex) {
			LOGGER.warn("Verification email dispatch worker failed; will retry on next schedule.", ex);
		}
	}
}
