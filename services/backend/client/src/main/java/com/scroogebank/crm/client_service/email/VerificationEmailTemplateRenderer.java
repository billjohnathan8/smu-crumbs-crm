package com.scroogebank.crm.client_service.email;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

/**
 * Renders verification email templates from classpath resources.
 */
@Component
public class VerificationEmailTemplateRenderer {
	private final String subjectTemplate;
	private final String bodyTemplate;

	public VerificationEmailTemplateRenderer(
		@Value("classpath:templates/verification-email/subject.txt") Resource subjectTemplateResource,
		@Value("classpath:templates/verification-email/body.txt") Resource bodyTemplateResource
	) {
		this.subjectTemplate = readTemplate(subjectTemplateResource, "subject");
		this.bodyTemplate = readTemplate(bodyTemplateResource, "body");
	}

	/**
	 * Renders an outbound verification email for a client.
	 *
	 * @param toEmail recipient email address
	 * @param firstName client first name
	 * @param clientId public client id
	 * @return rendered email payload
	 */
	public VerificationEmail render(String toEmail, String firstName, String clientId) {
		String safeFirstName = (firstName == null || firstName.isBlank()) ? "Customer" : firstName;
		String subject = applyTokens(subjectTemplate, safeFirstName, clientId);
		String body = applyTokens(bodyTemplate, safeFirstName, clientId);
		return new VerificationEmail(toEmail, subject, body);
	}

	private static String applyTokens(String template, String firstName, String clientId) {
		return template
			.replace("{{firstName}}", firstName)
			.replace("{{clientId}}", clientId);
	}

	private static String readTemplate(Resource resource, String templateName) {
		try (var inputStream = resource.getInputStream()) {
			return StreamUtils.copyToString(inputStream, StandardCharsets.UTF_8);
		}
		catch (IOException ex) {
			throw new IllegalStateException("Failed to load verification email " + templateName + " template.", ex);
		}
	}
}
