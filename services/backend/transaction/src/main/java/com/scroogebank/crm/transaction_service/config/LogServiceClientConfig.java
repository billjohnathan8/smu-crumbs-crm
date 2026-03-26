package com.scroogebank.crm.transaction_service.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Configures the REST client used to reach the Lambda-backed log API.
 */
@Configuration
public class LogServiceClientConfig {
	@Bean("logServiceRestClient")
	RestClient logServiceRestClient(
		@Value("${app.log-service-url}") String logServiceUrl
	) {
		return RestClient.builder()
			.requestFactory(new JdkClientHttpRequestFactory())
			.baseUrl(logServiceUrl)
			.build();
	}
}

