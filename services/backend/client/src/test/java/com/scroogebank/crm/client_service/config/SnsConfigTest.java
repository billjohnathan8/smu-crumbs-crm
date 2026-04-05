package com.scroogebank.crm.client_service.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.services.sns.SnsClient;

class SnsConfigTest {

	@Test
	void snsClient_buildsClientWithConfiguredRegion() {
		SnsConfig config = new SnsConfig();
		ReflectionTestUtils.setField(config, "region", "ap-southeast-1");

		try (SnsClient client = config.snsClient()) {
			assertThat(client).isNotNull();
		}
	}

	@Test
	void snsClientLocal_buildsClientWithLocalEndpoint() {
		SnsConfig config = new SnsConfig();
		ReflectionTestUtils.setField(config, "region", "ap-southeast-1");

		try (SnsClient client = config.snsClientLocal("http://localhost:4566")) {
			assertThat(client).isNotNull();
		}
	}
}
