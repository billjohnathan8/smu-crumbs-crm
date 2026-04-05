package com.scroogebank.crm.client_service.email;

import com.scroogebank.crm.client_service.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.SendEmailRequest;
import software.amazon.awssdk.services.sesv2.model.SendEmailResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link SesVerificationEmailSender}.
 */
class SesVerificationEmailSenderTest {
	private record Fixture(SesV2Client sesV2Client, AppProperties appProperties, SesVerificationEmailSender sender) {}

	private static Fixture fixture() {
		SesV2Client sesV2Client = mock(SesV2Client.class);
		AppProperties appProperties = new AppProperties();
		SesVerificationEmailSender sender = new SesVerificationEmailSender(sesV2Client, appProperties);
		return new Fixture(sesV2Client, appProperties, sender);
	}

	@Test
	void send_buildsAndSendsSesRequest() {
		Fixture fixture = fixture();
		fixture.appProperties().getVerificationEmail().setSenderEmail("sender@scroogebank.com");
		when(fixture.sesV2Client().sendEmail(org.mockito.ArgumentMatchers.any(SendEmailRequest.class)))
			.thenReturn(SendEmailResponse.builder().messageId("ses-message-1").build());

		String providerMessageId = fixture.sender().send(
			new VerificationEmail("client@example.com", "Subject", "Body text")
		);

		assertThat(providerMessageId).isEqualTo("ses-message-1");
		ArgumentCaptor<SendEmailRequest> captor = ArgumentCaptor.forClass(SendEmailRequest.class);
		verify(fixture.sesV2Client()).sendEmail(captor.capture());
		SendEmailRequest request = captor.getValue();
		assertThat(request.fromEmailAddress()).isEqualTo("sender@scroogebank.com");
		assertThat(request.destination().toAddresses()).containsExactly("client@example.com");
		assertThat(request.content().simple().subject().data()).isEqualTo("Subject");
		assertThat(request.content().simple().body().text().data()).isEqualTo("Body text");
	}

	@Test
	void send_missingSenderEmail_throws() {
		Fixture fixture = fixture();
		fixture.appProperties().getVerificationEmail().setSenderEmail(" ");

		assertThatThrownBy(() -> fixture.sender().send(new VerificationEmail("client@example.com", "Subject", "Body")))
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("sender email");
	}
}
