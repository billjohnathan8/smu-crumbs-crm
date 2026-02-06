package com.itsa.crm.transactions_service.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Configures the RestClient used to call the clients-service.
 */
@Configuration
public class ClientsServiceClientConfig {
	/**
	 * Builds a RestClient preconfigured with the clients-service base URL.
	 */
	@Bean
	RestClient clientsServiceRestClient(@Value("${app.clients-service-url}") String baseUrl) {
		return RestClient.builder().baseUrl(baseUrl).build();
	}
}
