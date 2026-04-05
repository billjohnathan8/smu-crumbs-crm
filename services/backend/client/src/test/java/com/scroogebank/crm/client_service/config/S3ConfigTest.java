package com.scroogebank.crm.client_service.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.services.s3.S3Client;

class S3ConfigTest {

	private static void assertClientCreatedAndClosable(S3Client client) {
		try (client) {
			assertThat(client).isNotNull();
		}
	}

	@Test
	void s3Client_buildsClientWithConfiguredRegion() {
		S3Config config = new S3Config();
		ReflectionTestUtils.setField(config, "region", "ap-southeast-1");

		assertClientCreatedAndClosable(config.s3Client());
	}

	@Test
	void localS3Client_buildsClientWithLocalEndpoint() {
		S3Config config = new S3Config();
		ReflectionTestUtils.setField(config, "region", "ap-southeast-1");

		assertClientCreatedAndClosable(config.localS3Client("http://localhost:4566"));
	}
}
