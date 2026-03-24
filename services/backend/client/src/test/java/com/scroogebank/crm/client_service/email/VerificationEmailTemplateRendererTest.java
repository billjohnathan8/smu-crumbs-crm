package com.scroogebank.crm.client_service.email;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link VerificationEmailTemplateRenderer}.
 */
class VerificationEmailTemplateRendererTest {
	@Test
	void render_replacesTokensInSubjectAndBody() {
		VerificationEmailTemplateRenderer renderer = new VerificationEmailTemplateRenderer(
			new ByteArrayResource("Hello {{firstName}}".getBytes()),
			new ByteArrayResource("Client {{clientId}}".getBytes())
		);

		VerificationEmail email = renderer.render("jordan@example.com", "Jordan", "clt_7");

		assertThat(email.toEmail()).isEqualTo("jordan@example.com");
		assertThat(email.subject()).isEqualTo("Hello Jordan");
		assertThat(email.body()).isEqualTo("Client clt_7");
	}

	@Test
	void render_blankFirstName_usesCustomerFallback() {
		VerificationEmailTemplateRenderer renderer = new VerificationEmailTemplateRenderer(
			new ByteArrayResource("Hello {{firstName}}".getBytes()),
			new ByteArrayResource("Body".getBytes())
		);

		VerificationEmail email = renderer.render("jordan@example.com", "  ", "clt_9");

		assertThat(email.subject()).isEqualTo("Hello Customer");
	}
}
