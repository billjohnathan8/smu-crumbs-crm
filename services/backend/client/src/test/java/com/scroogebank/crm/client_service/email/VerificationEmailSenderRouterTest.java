package com.scroogebank.crm.client_service.email;

import com.scroogebank.crm.client_service.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link VerificationEmailSenderRouter}.
 */
class VerificationEmailSenderRouterTest {
	private record Fixture(
		AppProperties appProperties,
		MockVerificationEmailSender mockSender,
		ObjectProvider<SesVerificationEmailSender> sesSenderProvider,
		VerificationEmailSenderRouter router
	) {}

	private static Fixture fixture() {
		AppProperties appProperties = new AppProperties();
		MockVerificationEmailSender mockSender = mock(MockVerificationEmailSender.class);
		ObjectProvider<SesVerificationEmailSender> sesSenderProvider = mockSesSenderProvider();
		VerificationEmailSenderRouter router = new VerificationEmailSenderRouter(appProperties, mockSender, sesSenderProvider);
		return new Fixture(appProperties, mockSender, sesSenderProvider, router);
	}

	@SuppressWarnings("unchecked")
	private static ObjectProvider<SesVerificationEmailSender> mockSesSenderProvider() {
		return (ObjectProvider<SesVerificationEmailSender>) mock(ObjectProvider.class);
	}

	@Test
	void send_providerMock_usesMockSender() {
		Fixture fixture = fixture();
		fixture.appProperties().getVerificationEmail().setProvider("mock");
		when(fixture.mockSender().send(any())).thenReturn("mock-1");

		String providerMessageId = fixture.router().send(new VerificationEmail("client@example.com", "subject", "body"));

		assertThat(providerMessageId).isEqualTo("mock-1");
		verify(fixture.mockSender()).send(any());
	}

	@Test
	void send_providerSes_usesSesSenderWhenAvailable() {
		Fixture fixture = fixture();
		fixture.appProperties().getVerificationEmail().setProvider("ses");
		SesVerificationEmailSender sesSender = mock(SesVerificationEmailSender.class);
		when(fixture.sesSenderProvider().getIfAvailable()).thenReturn(sesSender);
		when(sesSender.send(any())).thenReturn("ses-1");

		String providerMessageId = fixture.router().send(new VerificationEmail("client@example.com", "subject", "body"));

		assertThat(providerMessageId).isEqualTo("ses-1");
		verify(sesSender).send(any());
	}

	@Test
	void send_providerSes_failurePropagates() {
		Fixture fixture = fixture();
		fixture.appProperties().getVerificationEmail().setProvider("ses");
		SesVerificationEmailSender sesSender = mock(SesVerificationEmailSender.class);
		when(fixture.sesSenderProvider().getIfAvailable()).thenReturn(sesSender);
		when(sesSender.send(any())).thenThrow(new RuntimeException("ses down"));

		assertThatThrownBy(() -> fixture.router().send(new VerificationEmail("client@example.com", "subject", "body")))
			.isInstanceOf(RuntimeException.class)
			.hasMessageContaining("ses down");
		verify(sesSender).send(any());
	}
}
