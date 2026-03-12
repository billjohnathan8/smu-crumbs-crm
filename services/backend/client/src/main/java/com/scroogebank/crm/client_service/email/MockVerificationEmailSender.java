package com.scroogebank.crm.client_service.email;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Local development/test email sender that logs outbound payloads instead of delivering.
 */
@Component
public class MockVerificationEmailSender implements VerificationEmailSender {
	private static final Logger LOGGER = LoggerFactory.getLogger(MockVerificationEmailSender.class);
	private static final int BODY_PREVIEW_LIMIT = 120;

	@Override
	public String send(VerificationEmail email) {
		String providerMessageId = "mock-" + UUID.randomUUID();
		LOGGER.info(
			"Mock verification email sent. to={} subject={} providerMessageId={} bodyPreview={}",
			email.toEmail(),
			email.subject(),
			providerMessageId,
			preview(email.body())
		);
		return providerMessageId;
	}

	private static String preview(String body) {
		if (body == null) {
			return "";
		}
		return body.length() <= BODY_PREVIEW_LIMIT
			? body
			: body.substring(0, BODY_PREVIEW_LIMIT) + "...";
	}
}
