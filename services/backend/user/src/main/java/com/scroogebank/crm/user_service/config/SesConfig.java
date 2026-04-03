package com.scroogebank.crm.user_service.config;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.SesV2ClientBuilder;

@Configuration
public class SesConfig {

	@Value("${aws.ses.region:ap-southeast-1}")
	private String region;

	@Value("${aws.ses.endpoint-url:}")
	private String endpointUrl;

	@Value("${AWS_ACCESS_KEY_ID:}")
	private String accessKeyId;

	@Value("${AWS_SECRET_ACCESS_KEY:}")
	private String secretAccessKey;

	@Bean
	public SesV2Client sesClient() {
		SesV2ClientBuilder builder = SesV2Client.builder()
			.region(Region.of(region))
			.credentialsProvider(resolveCredentialsProvider());

		if (!endpointUrl.isBlank()) {
			builder.endpointOverride(URI.create(endpointUrl));
		}
		return builder.build();
	}

	private AwsCredentialsProvider resolveCredentialsProvider() {
		if (!accessKeyId.isBlank() && !secretAccessKey.isBlank()) {
			return StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKeyId, secretAccessKey));
		}
		if (!endpointUrl.isBlank()) {
			return StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test"));
		}
		return DefaultCredentialsProvider.create();
	}
}
