package com.scroogebank.crm.client_service.email;

import com.scroogebank.crm.client_service.config.AppProperties;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * Routes verification email delivery to SES or mock sender based on configuration.
 * Falls back to mock sender only when SES sender is unavailable.
 */
@Component
@Primary
public class VerificationEmailSenderRouter implements VerificationEmailSender {
	private static final Logger LOGGER = LoggerFactory.getLogger(VerificationEmailSenderRouter.class);
	private static final String SES_PROVIDER = "ses";

	private final AppProperties appProperties;
	private final MockVerificationEmailSender mockSender;
	private final ObjectProvider<SesVerificationEmailSender> sesSenderProvider;

	public VerificationEmailSenderRouter(
		AppProperties appProperties,
		MockVerificationEmailSender mockSender,
		ObjectProvider<SesVerificationEmailSender> sesSenderProvider
	) {
		this.appProperties = appProperties;
		this.mockSender = mockSender;
		this.sesSenderProvider = sesSenderProvider;
	}

	@Override
	public String send(VerificationEmail email) {
		String provider = appProperties.getVerificationEmail().getProvider();
		String normalizedProvider = provider == null ? "" : provider.trim().toLowerCase(Locale.ROOT);

		if (!SES_PROVIDER.equals(normalizedProvider)) {
			return mockSender.send(email);
		}

		SesVerificationEmailSender sesSender = sesSenderProvider.getIfAvailable();
		if (sesSender == null) {
			LOGGER.warn("SES email provider configured but SES sender is unavailable. Falling back to mock sender.");
			return mockSender.send(email);
		}
		return sesSender.send(email);
	}
}
