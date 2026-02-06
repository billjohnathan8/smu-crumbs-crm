package com.itsa.crm.transaction_service.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Configures the RestClient used to call the client-service.
 */
@Configuration
public class ClientServiceClientConfig {
	/**
	 * Builds a RestClient preconfigured with the client-service base URL.
	 */
	@Bean
	RestClient clientServiceRestClient(@Value("${app.client-service-url}") String baseUrl) {
		return RestClient.builder().baseUrl(baseUrl).build();
	}
}

