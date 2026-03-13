package com.scroogebank.crm.client_service.email;

import java.net.URI;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.scroogebank.crm.client_service.config.AppProperties;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.SesV2ClientBuilder;

/**
 * Wiring for SES-backed verification email sender.
 */
@Configuration
public class VerificationEmailConfig {
	@Bean
	@ConditionalOnProperty(name = "app.verification-email.provider", havingValue = "ses")
	public SesV2Client sesV2Client(AppProperties appProperties) {
		SesV2ClientBuilder builder = SesV2Client.builder();
		String awsRegion = appProperties.getVerificationEmail().getAwsRegion();
		if (awsRegion != null && !awsRegion.isBlank()) {
			builder.region(Region.of(awsRegion));
		}
		String awsEndpointUrl = appProperties.getVerificationEmail().getAwsEndpointUrl();
		if (awsEndpointUrl != null && !awsEndpointUrl.isBlank()) {
			builder.endpointOverride(URI.create(awsEndpointUrl));
		}
		return builder.build();
	}

	@Bean
	@ConditionalOnBean(SesV2Client.class)
	public SesVerificationEmailSender sesVerificationEmailSender(
		SesV2Client sesV2Client,
		AppProperties appProperties
	) {
		return new SesVerificationEmailSender(sesV2Client, appProperties);
	}
}
