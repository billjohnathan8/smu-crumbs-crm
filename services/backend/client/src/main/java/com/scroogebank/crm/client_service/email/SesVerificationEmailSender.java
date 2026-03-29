package com.scroogebank.crm.client_service.email;

import com.scroogebank.crm.client_service.config.AppProperties;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.Body;
import software.amazon.awssdk.services.sesv2.model.Content;
import software.amazon.awssdk.services.sesv2.model.Destination;
import software.amazon.awssdk.services.sesv2.model.EmailContent;
import software.amazon.awssdk.services.sesv2.model.Message;
import software.amazon.awssdk.services.sesv2.model.SendEmailRequest;
import software.amazon.awssdk.services.sesv2.model.SendEmailResponse;

/**
 * SES-backed verification email sender.
 */
public class SesVerificationEmailSender implements VerificationEmailSender {
	private static final String UTF_8 = "UTF-8";

	private final SesV2Client sesV2Client;
	private final AppProperties appProperties;

	public SesVerificationEmailSender(SesV2Client sesV2Client, AppProperties appProperties) {
		this.sesV2Client = sesV2Client;
		this.appProperties = appProperties;
	}

	@Override
	public String send(VerificationEmail email) {
		String senderEmail = appProperties.getVerificationEmail().getSenderEmail();
		if (senderEmail == null || senderEmail.isBlank()) {
			throw new IllegalStateException("SES sender email is required when provider=ses.");
		}

		SendEmailRequest request = SendEmailRequest.builder()
			.fromEmailAddress(senderEmail)
			.destination(Destination.builder().toAddresses(email.toEmail()).build())
			.content(EmailContent.builder().simple(
					Message.builder()
						.subject(Content.builder().data(email.subject()).charset(UTF_8).build())
						.body(Body.builder().text(Content.builder().data(email.body()).charset(UTF_8).build()).build())
						.build()
				).build())
			.build();

		SendEmailResponse response = sesV2Client.sendEmail(request);
		return response.messageId();
	}
}
