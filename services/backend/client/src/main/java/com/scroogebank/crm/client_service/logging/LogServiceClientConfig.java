package com.scroogebank.crm.client_service.logging;

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
	/**
	 * Builds a {@link RestClient} with the configured base URL.
	 * Uses JDK HttpClient request factory so PATCH requests are supported when
	 * communicating with the Lambda-backed log API.
	 *
	 * @param logServiceUrl base URL for the log API endpoint
	 * @return RestClient instance
	 */
	@Bean
	RestClient logServiceRestClient(
		@Value("${app.log-service-url}") String logServiceUrl
	) {
		return RestClient.builder()
			.requestFactory(new JdkClientHttpRequestFactory())
			.baseUrl(logServiceUrl)
			.build();
	}
}
