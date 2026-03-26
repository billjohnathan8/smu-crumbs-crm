package com.scroogebank.crm.client_service.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

import java.net.URI;

@Configuration
public class S3Config {

    @Value("${aws.region:ap-southeast-1}")
    private String region;

    // ── Production: uses IAM role / environment credentials ──────────────────
    @Bean
    @Profile("!local")
    public S3Client s3Client() {
        return S3Client.builder()
            .region(Region.of(region))
            .build();
    }

    // ── Local: points to LocalStack ───────────────────────────────────────────
    @Bean
    @Profile("local")
    public S3Client localS3Client(
        @Value("${localstack.endpoint:http://localhost:4566}") String endpoint
    ) {
        return S3Client.builder()
            .region(Region.of(region))
            .endpointOverride(URI.create(endpoint))
            .credentialsProvider(
                StaticCredentialsProvider.create(
                    AwsBasicCredentials.create("test", "test") // LocalStack accepts any value
                )
            )
            .forcePathStyle(true) // required for LocalStack — prevents virtual-hosted style URLs
            .build();
        }
}