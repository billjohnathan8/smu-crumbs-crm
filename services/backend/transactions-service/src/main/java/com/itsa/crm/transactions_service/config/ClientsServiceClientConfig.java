package com.itsa.crm.transactions_service.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class ClientsServiceClientConfig {
	@Bean
	RestClient clientsServiceRestClient(@Value("${app.clients-service-url}") String baseUrl) {
		return RestClient.builder().baseUrl(baseUrl).build();
	}
}

