package com.scroogebank.crm.client_service.email;

import com.scroogebank.crm.client_service.config.AppProperties;
import org.junit.jupiter.api.BeforeEach;
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
	private AppProperties appProperties;
	private MockVerificationEmailSender mockSender;
	private ObjectProvider<SesVerificationEmailSender> sesSenderProvider;
	private VerificationEmailSenderRouter router;

	@BeforeEach
	void setUp() {
		appProperties = new AppProperties();
		mockSender = mock(MockVerificationEmailSender.class);
		sesSenderProvider = mock(ObjectProvider.class);
		router = new VerificationEmailSenderRouter(appProperties, mockSender, sesSenderProvider);
	}

	@Test
	void send_providerMock_usesMockSender() {
		appProperties.getVerificationEmail().setProvider("mock");
		when(mockSender.send(any())).thenReturn("mock-1");

		String providerMessageId = router.send(new VerificationEmail("client@example.com", "subject", "body"));

		assertThat(providerMessageId).isEqualTo("mock-1");
		verify(mockSender).send(any());
	}

	@Test
	void send_providerSes_usesSesSenderWhenAvailable() {
		appProperties.getVerificationEmail().setProvider("ses");
		SesVerificationEmailSender sesSender = mock(SesVerificationEmailSender.class);
		when(sesSenderProvider.getIfAvailable()).thenReturn(sesSender);
		when(sesSender.send(any())).thenReturn("ses-1");

		String providerMessageId = router.send(new VerificationEmail("client@example.com", "subject", "body"));

		assertThat(providerMessageId).isEqualTo("ses-1");
		verify(sesSender).send(any());
	}

	@Test
	void send_providerSes_failurePropagates() {
		appProperties.getVerificationEmail().setProvider("ses");
		SesVerificationEmailSender sesSender = mock(SesVerificationEmailSender.class);
		when(sesSenderProvider.getIfAvailable()).thenReturn(sesSender);
		when(sesSender.send(any())).thenThrow(new RuntimeException("ses down"));

		assertThatThrownBy(() -> router.send(new VerificationEmail("client@example.com", "subject", "body")))
			.isInstanceOf(RuntimeException.class)
			.hasMessageContaining("ses down");
		verify(sesSender).send(any());
	}
}
