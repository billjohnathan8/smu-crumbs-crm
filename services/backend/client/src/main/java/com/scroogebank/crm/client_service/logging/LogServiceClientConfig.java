package com.scroogebank.crm.client_service.logging;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Configures the REST client used to reach the Lambda-backed log API.
 */
@Configuration
public class LogServiceClientConfig {
	/**
	 * Builds a {@link RestClient} with the configured base URL.
	 * Uses SimpleClientHttpRequestFactory (HTTP/1.1) for compatibility with
	 * LocalStack/API Gateway style HTTP endpoints in local and CI flows.
	 *
	 * @param logServiceUrl base URL for the log API endpoint
	 * @return RestClient instance
	 */
	@Bean
	RestClient logServiceRestClient(
		@Value("${app.log-service-url}") String logServiceUrl
	) {
		return RestClient.builder()
			.requestFactory(new SimpleClientHttpRequestFactory())
			.baseUrl(logServiceUrl)
			.build();
	}
}
