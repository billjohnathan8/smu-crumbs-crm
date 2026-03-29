package com.scroogebank.crm.client_service.config;

import java.net.URI;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sns.SnsClient;

@Configuration
public class SnsConfig {

    @Value("${aws.region:ap-southeast-1}")
    private String region;

    private ClientOverrideConfiguration snsTimeoutConfig() {
        return ClientOverrideConfiguration.builder()
            .apiCallTimeout(Duration.ofSeconds(5))
            .apiCallAttemptTimeout(Duration.ofSeconds(3))
            .build();
    }

    // ── Production: uses IAM role / environment credentials ──────────────────
    @Bean
    @Profile("!local")
    public SnsClient snsClient() {
        return SnsClient.builder()
            .region(Region.of(region))
            .overrideConfiguration(snsTimeoutConfig())
            .build();
    }

    // ── Local: points to LocalStack ───────────────────────────────────────────
    @Bean
    @Profile("local")
    public SnsClient snsClientLocal(
        @Value("${localstack.endpoint:http://localhost:4566}") String endpoint
    ) {
        return SnsClient.builder()
            .region(Region.of(region))
            .endpointOverride(URI.create(endpoint))
            .overrideConfiguration(snsTimeoutConfig())
            .credentialsProvider(
                StaticCredentialsProvider.create(
                    AwsBasicCredentials.create("test", "test") // LocalStack accepts any value
                )
            )
            .build();
        }
}