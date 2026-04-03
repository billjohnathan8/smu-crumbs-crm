package com.scroogebank.crm.user_service.service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.Body;
import software.amazon.awssdk.services.sesv2.model.Content;
import software.amazon.awssdk.services.sesv2.model.Destination;
import software.amazon.awssdk.services.sesv2.model.EmailContent;
import software.amazon.awssdk.services.sesv2.model.Message;
import software.amazon.awssdk.services.sesv2.model.SendEmailRequest;

@Service
public class PasswordResetEmailService {
	private static final Logger LOGGER = LoggerFactory.getLogger(PasswordResetEmailService.class);

	private final SesV2Client sesClient;
	private final String senderEmail;
	private final String frontendBaseUrl;

	public PasswordResetEmailService(
		SesV2Client sesClient,
		@Value("${app.password-reset.sender-email:}") String senderEmail,
		@Value("${app.password-reset.frontend-base-url:}") String frontendBaseUrl
	) {
		this.sesClient = sesClient;
		this.senderEmail = senderEmail == null ? "" : senderEmail.trim();
		this.frontendBaseUrl = frontendBaseUrl == null ? "" : frontendBaseUrl.trim();
	}

	public void sendResetPasswordEmail(String recipientEmail, String token) {
		if (recipientEmail == null || recipientEmail.isBlank() || token == null || token.isBlank()) {
			return;
		}
		if (senderEmail.isBlank() || frontendBaseUrl.isBlank()) {
			LOGGER.warn("Password reset email skipped because sender or frontend base URL is not configured");
			return;
		}

		String encodedToken = URLEncoder.encode(token, StandardCharsets.UTF_8);
		String resetUrl = frontendBaseUrl.replaceAll("/+$", "") + "/reset-password?token=" + encodedToken;
		String subject = "Reset your password";
		String textBody = "Use this link to reset your password: " + resetUrl
			+ "\n\nThis link expires in 1 hour.";
		String htmlBody = "<p>Use this link to reset your password:</p>"
			+ "<p><a href=\"" + resetUrl + "\">Reset Password</a></p>"
			+ "<p>This link expires in 1 hour.</p>";

		SendEmailRequest request = SendEmailRequest.builder()
			.fromEmailAddress(senderEmail)
			.destination(Destination.builder().toAddresses(recipientEmail).build())
			.content(
				EmailContent.builder()
					.simple(
						Message.builder()
							.subject(Content.builder().data(subject).charset("UTF-8").build())
							.body(
								Body.builder()
									.text(Content.builder().data(textBody).charset("UTF-8").build())
									.html(Content.builder().data(htmlBody).charset("UTF-8").build())
									.build()
							)
							.build()
					)
					.build()
			)
			.build();

		sesClient.sendEmail(request);
	}
}
