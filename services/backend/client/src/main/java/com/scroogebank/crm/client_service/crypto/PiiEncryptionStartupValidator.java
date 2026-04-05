package com.scroogebank.crm.client_service.crypto;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Initializes PII crypto settings and validates key usability during startup.
 */
@Component
public class PiiEncryptionStartupValidator implements InitializingBean {
	private final String configuredPiiKey;
	private final boolean strictMode;

	public PiiEncryptionStartupValidator(
		@Value("${PII_ENCRYPTION_KEY:}") String configuredPiiKey,
		@Value("${app.pii.strict-mode:false}") boolean strictMode
	) {
		this.configuredPiiKey = configuredPiiKey;
		this.strictMode = strictMode;
	}

	@Override
	public void afterPropertiesSet() {
		System.setProperty("PII_STRICT_MODE", Boolean.toString(strictMode));
		if ((System.getProperty("PII_ENCRYPTION_KEY") == null || System.getProperty("PII_ENCRYPTION_KEY").isBlank())
			&& configuredPiiKey != null && !configuredPiiKey.isBlank()) {
			System.setProperty("PII_ENCRYPTION_KEY", configuredPiiKey);
		}
		EncryptedStringConverter.requireUsableKey();
	}

}
