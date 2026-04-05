package com.scroogebank.crm.client_service.email;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MockVerificationEmailSenderTest {

	@Test
	void send_withNullBody_returnsMockMessageId() {
		MockVerificationEmailSender sender = new MockVerificationEmailSender();

		String providerMessageId = sender.send(
			new VerificationEmail("client@example.com", "Subject", null)
		);

		assertThat(providerMessageId).startsWith("mock-");
	}

	@Test
	void send_withShortBody_returnsMockMessageId() {
		MockVerificationEmailSender sender = new MockVerificationEmailSender();

		String providerMessageId = sender.send(
			new VerificationEmail("client@example.com", "Subject", "short-body")
		);

		assertThat(providerMessageId).startsWith("mock-");
	}

	@Test
	void send_withLongBody_returnsMockMessageId() {
		MockVerificationEmailSender sender = new MockVerificationEmailSender();
		String longBody = "x".repeat(200);

		String providerMessageId = sender.send(
			new VerificationEmail("client@example.com", "Subject", longBody)
		);

		assertThat(providerMessageId).startsWith("mock-");
	}
}
