package com.scroogebank.crm.client_service.logging;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Configures the REST client used to reach the log service.
 */
@Configuration
public class LogServiceClientConfig {
	/**
	 * Builds a {@link RestClient} with the configured base URL.
	 *
	 * @param logServiceUrl base URL for the log service
	 * @return RestClient instance
	 */
	@Bean
	RestClient logServiceRestClient(@Value("${app.log-service-url}") String logServiceUrl) {
		return RestClient.builder().baseUrl(logServiceUrl).build();
	}
}
